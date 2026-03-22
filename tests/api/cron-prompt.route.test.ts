import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getEnvMock, sendCallForSubmissionsMock, runWithTelemetryMock } = vi.hoisted(() => ({
  getEnvMock: vi.fn(),
  sendCallForSubmissionsMock: vi.fn(),
  runWithTelemetryMock: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnv: getEnvMock,
}));

vi.mock("@/lib/email", () => ({
  sendCallForSubmissions: sendCallForSubmissionsMock,
}));

vi.mock("@/lib/telemetry", () => ({
  runWithTelemetry: runWithTelemetryMock,
}));

import { GET } from "../../app/api/cron/prompt/route";

function createRequest(headers: Record<string, string> = {}, query?: string): Request {
  const baseUrl = "http://localhost/api/cron/prompt";
  const url = query ? `${baseUrl}?${query}` : baseUrl;
  return new Request(url, {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/prompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T10:00:00.000Z"));

    getEnvMock.mockReset();
    sendCallForSubmissionsMock.mockReset();
    runWithTelemetryMock.mockReset();

    getEnvMock.mockReturnValue({
      CRON_SECRET: "cron-secret",
      DISPATCH_APP_URL: "https://dispatch.example.com",
    });

    runWithTelemetryMock.mockImplementation(
      async (_spanName: string, callback: () => Promise<unknown>) => callback(),
    );

    sendCallForSubmissionsMock.mockResolvedValue({
      provider: "resend",
      audienceId: "audience_123",
      broadcastId: "broadcast_prompt_1",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when authorization is missing", async () => {
    const response = await GET(createRequest());

    expect(response.status).toBe(401);
    expect(sendCallForSubmissionsMock).not.toHaveBeenCalled();
  });

  it("sends prompt broadcast when bearer token matches CRON_SECRET", async () => {
    const response = await GET(
      createRequest({
        authorization: "Bearer cron-secret",
      }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;

    expect(body.status).toBe("sent");
    expect(body.trigger).toBe("scheduled");
    expect(body.weekId).toBe("2026-03-16");
    expect(body.delivery).toEqual({
      channel: "email",
      provider: "resend",
      audienceId: "audience_123",
      broadcastId: "broadcast_prompt_1",
    });

    expect(sendCallForSubmissionsMock).toHaveBeenCalledWith({
      submissionUrl: "https://dispatch.example.com",
    });
  });

  it("accepts x-cron-secret header", async () => {
    const response = await GET(
      createRequest({
        "x-cron-secret": "cron-secret",
      }),
    );

    expect(response.status).toBe(200);
    expect(sendCallForSubmissionsMock).toHaveBeenCalledTimes(1);
  });

  it("reports manual trigger when query param is set", async () => {
    const response = await GET(
      createRequest(
        {
          authorization: "Bearer cron-secret",
        },
        "trigger=manual",
      ),
    );

    const body = (await response.json()) as { trigger: string };

    expect(response.status).toBe(200);
    expect(body.trigger).toBe("manual");
  });
});
