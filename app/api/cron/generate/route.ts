import { NextResponse } from "next/server";

import { generateDispatchContent } from "@/lib/dispatch";
import { getEnv } from "@/lib/env";
import { getWeekId } from "@/lib/keys";
import {
  acquireWeekDispatchLock,
  listCurrentWeekSubmissions,
  markWeekDispatchComplete,
  releaseWeekDispatchLock,
} from "@/lib/submissions";
import { runWithTelemetry } from "@/lib/telemetry";

class DispatchGenerationError extends Error {
  submissionCount: number;

  constructor(submissionCount: number) {
    super("Dispatch generation failed");
    this.name = "DispatchGenerationError";
    this.submissionCount = submissionCount;
  }
}

function getBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

function isCronRequestAuthorized(request: Request, cronSecret: string): boolean {
  const authorizationToken = getBearerToken(request.headers.get("authorization"));

  if (authorizationToken && authorizationToken === cronSecret) {
    return true;
  }

  const headerSecret = request.headers.get("x-cron-secret");
  return Boolean(headerSecret && headerSecret === cronSecret);
}

export async function GET(request: Request) {
  const weekId = getWeekId();
  try {
    return await runWithTelemetry(
      "cron.generate",
      async () => {
        const { CRON_SECRET } = getEnv();

        if (!isCronRequestAuthorized(request, CRON_SECRET)) {
          return NextResponse.json(
            {
              status: "unauthorized",
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
            weekId,
            submissionCount: 0,
          });
        }

        const lockAcquired = await acquireWeekDispatchLock(weekId);

        if (!lockAcquired) {
          return NextResponse.json(
            {
              status: "already_processed",
              weekId,
              submissionCount,
            },
            {
              status: 409,
            },
          );
        }

        try {
          const dispatch = await generateDispatchContent({
            weekId,
            submissions,
          });

          await markWeekDispatchComplete(weekId);

          return NextResponse.json({
            status: "ready_for_delivery",
            weekId,
            submissionCount,
            dispatch,
            delivery: {
              channel: "email",
              ready: true,
            },
          });
        } catch {
          await releaseWeekDispatchLock(weekId);
          throw new DispatchGenerationError(submissionCount);
        }
      },
      {
        weekId,
      },
    );
  } catch (error) {
    if (error instanceof DispatchGenerationError) {
      return NextResponse.json(
        {
          status: "generation_failed",
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
