import { NextResponse } from "next/server";

import { getTriggerMode, isCronRequestAuthorized } from "@/lib/cron-auth";
import { sendCallForSubmissions } from "@/lib/email";
import { getEnv } from "@/lib/env";
import { getWeekId } from "@/lib/keys";
import { runWithTelemetry } from "@/lib/telemetry";

export async function GET(request: Request) {
  const weekId = getWeekId();
  const trigger = getTriggerMode(request);

  return runWithTelemetry(
    "cron.prompt",
    async () => {
      const { CRON_SECRET, DISPATCH_APP_URL } = getEnv();

      if (!isCronRequestAuthorized(request, CRON_SECRET)) {
        return NextResponse.json(
          {
            status: "unauthorized",
            trigger,
            weekId,
          },
          { status: 401 },
        );
      }

      const delivery = await sendCallForSubmissions({
        submissionUrl: DISPATCH_APP_URL,
      });

      return NextResponse.json({
        status: "sent",
        trigger,
        weekId,
        delivery: {
          channel: "email",
          ...delivery,
        },
      });
    },
    {
      weekId,
    },
  );
}
