import { NextResponse } from "next/server";

import { getTriggerMode, isCronRequestAuthorized } from "@/lib/cron-auth";
import { generateDispatchContent } from "@/lib/dispatch";
import { sendWeeklyDispatch } from "@/lib/email";
import { getEnv } from "@/lib/env";
import { getWeekId } from "@/lib/keys";
import {
  acquireWeekDispatchLock,
  archiveAndClearCurrentWeek,
  listCurrentWeekSubmissions,
  markWeekDispatchComplete,
  releaseWeekDispatchLock,
} from "@/lib/submissions";
import { runWithTelemetry } from "@/lib/telemetry";
import type { DispatchContent } from "@/lib/types";

class DispatchGenerationError extends Error {
  submissionCount: number;

  constructor(submissionCount: number) {
    super("Dispatch generation failed");
    this.name = "DispatchGenerationError";
    this.submissionCount = submissionCount;
  }
}

class DispatchDeliveryError extends Error {
  submissionCount: number;

  constructor(submissionCount: number) {
    super("Dispatch delivery failed");
    this.name = "DispatchDeliveryError";
    this.submissionCount = submissionCount;
  }
}

class DispatchCompletionError extends Error {
  submissionCount: number;

  constructor(submissionCount: number) {
    super("Dispatch completion failed");
    this.name = "DispatchCompletionError";
    this.submissionCount = submissionCount;
  }
}

export async function GET(request: Request) {
  const weekId = getWeekId();
  const trigger = getTriggerMode(request);
  try {
    return await runWithTelemetry(
      "cron.generate",
      async () => {
        const { CRON_SECRET } = getEnv();

        if (!isCronRequestAuthorized(request, CRON_SECRET)) {
          return NextResponse.json(
            {
              status: "unauthorized",
              trigger,
              weekId,
              submissionCount: 0,
            },
            {
              status: 401,
            },
          );
        }

        const submissions = await listCurrentWeekSubmissions();
        const submissionCount = submissions.length;

        if (submissionCount === 0) {
          return NextResponse.json({
            status: "no_submissions",
            trigger,
            weekId,
            submissionCount: 0,
          });
        }

        const lockAcquired = await acquireWeekDispatchLock(weekId);

        if (!lockAcquired) {
          return NextResponse.json(
            {
              status: "already_processed",
              trigger,
              weekId,
              submissionCount,
            },
            {
              status: 409,
            },
          );
        }

        let dispatch: DispatchContent;

        try {
          dispatch = await generateDispatchContent({
            weekId,
            submissions,
          });
        } catch {
          await releaseWeekDispatchLock(weekId);
          throw new DispatchGenerationError(submissionCount);
        }

        try {
          const delivery = await sendWeeklyDispatch({
            dispatch,
          });
          const archive = await archiveAndClearCurrentWeek();

          try {
            await markWeekDispatchComplete(weekId);
          } catch {
            await releaseWeekDispatchLock(weekId);
            throw new DispatchCompletionError(submissionCount);
          }

          return NextResponse.json({
            status: "sent",
            trigger,
            weekId,
            submissionCount,
            dispatch,
            delivery: {
              channel: "email",
              ...delivery,
            },
            archive,
          });
        } catch (error) {
          if (error instanceof DispatchCompletionError) {
            throw error;
          }
          await releaseWeekDispatchLock(weekId);
          throw new DispatchDeliveryError(submissionCount);
        }
      },
      {
        weekId,
      },
    );
  } catch (error) {
    if (error instanceof DispatchCompletionError) {
      return NextResponse.json(
        {
          status: "completion_failed",
          trigger,
          weekId,
          submissionCount: error.submissionCount,
        },
        {
          status: 502,
        },
      );
    }

    if (error instanceof DispatchDeliveryError) {
      return NextResponse.json(
        {
          status: "delivery_failed",
          trigger,
          weekId,
          submissionCount: error.submissionCount,
        },
        {
          status: 502,
        },
      );
    }

    if (error instanceof DispatchGenerationError) {
      return NextResponse.json(
        {
          status: "generation_failed",
          trigger,
          weekId,
          submissionCount: error.submissionCount,
        },
        {
          status: 500,
        },
      );
    }

    throw error;
  }
}
