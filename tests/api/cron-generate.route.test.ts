import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DispatchContent, Submission } from "@/lib/types";

const {
  getEnvMock,
  listCurrentWeekSubmissionsMock,
  acquireWeekDispatchLockMock,
  markWeekDispatchCompleteMock,
  releaseWeekDispatchLockMock,
  generateDispatchContentMock,
  runWithTelemetryMock,
} = vi.hoisted(() => ({
  getEnvMock: vi.fn(),
  listCurrentWeekSubmissionsMock: vi.fn(),
  acquireWeekDispatchLockMock: vi.fn(),
  markWeekDispatchCompleteMock: vi.fn(),
  releaseWeekDispatchLockMock: vi.fn(),
  generateDispatchContentMock: vi.fn(),
  runWithTelemetryMock: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnv: getEnvMock,
}));

vi.mock("@/lib/submissions", () => ({
  listCurrentWeekSubmissions: listCurrentWeekSubmissionsMock,
  acquireWeekDispatchLock: acquireWeekDispatchLockMock,
  markWeekDispatchComplete: markWeekDispatchCompleteMock,
  releaseWeekDispatchLock: releaseWeekDispatchLockMock,
}));

vi.mock("@/lib/dispatch", () => ({
  generateDispatchContent: generateDispatchContentMock,
}));

vi.mock("@/lib/telemetry", () => ({
  runWithTelemetry: runWithTelemetryMock,
}));

import { GET } from "../../app/api/cron/generate/route";

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/generate", {
    method: "GET",
    headers,
  });
}

describe("GET /api/cron/generate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T10:00:00.000Z"));

    getEnvMock.mockReset();
    listCurrentWeekSubmissionsMock.mockReset();
    acquireWeekDispatchLockMock.mockReset();
    markWeekDispatchCompleteMock.mockReset();
    releaseWeekDispatchLockMock.mockReset();
    generateDispatchContentMock.mockReset();
    runWithTelemetryMock.mockReset();

    getEnvMock.mockReturnValue({
      CRON_SECRET: "cron-secret",
    });

    runWithTelemetryMock.mockImplementation(
      async (_spanName: string, callback: () => Promise<unknown>) => callback(),
    );

    markWeekDispatchCompleteMock.mockResolvedValue(undefined);
    releaseWeekDispatchLockMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects unauthorized cron calls without matching secret", async () => {
    const response = await GET(createRequest());
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload).toEqual({
      status: "unauthorized",
      weekId: "2026-03-16",
      submissionCount: 0,
    });
    expect(listCurrentWeekSubmissionsMock).not.toHaveBeenCalled();
    expect(acquireWeekDispatchLockMock).not.toHaveBeenCalled();
    expect(generateDispatchContentMock).not.toHaveBeenCalled();
    expect(runWithTelemetryMock).toHaveBeenCalledWith(
      "cron.generate",
      expect.any(Function),
      {
        weekId: "2026-03-16",
      },
    );
  });

  it("returns a no-op result when no submissions exist", async () => {
    listCurrentWeekSubmissionsMock.mockResolvedValue([]);

    const response = await GET(
      createRequest({
        authorization: "Bearer cron-secret",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "no_submissions",
      weekId: "2026-03-16",
      submissionCount: 0,
    });
    expect(acquireWeekDispatchLockMock).not.toHaveBeenCalled();
    expect(generateDispatchContentMock).not.toHaveBeenCalled();
  });

  it("generates dispatch content and returns delivery-path-ready payload", async () => {
    const submissions: Submission[] = [
      {
        author: "Rohit",
        content: "Shipped phase 4",
        timestamp: "2026-03-20T08:00:00.000Z",
      },
      {
        author: "Nina",
        content: "Closed out the onboarding tasks",
        timestamp: "2026-03-20T09:00:00.000Z",
      },
    ];

    const dispatch: DispatchContent = {
      subject: "Weekend Dispatch - 2026-03-16",
      preview: "Two updates this week from Rohit and Nina",
      markdown: "## The Weekend Dispatch\n\n- Rohit: Shipped phase 4\n- Nina: Closed out the onboarding tasks",
    };

    listCurrentWeekSubmissionsMock.mockResolvedValue(submissions);
    acquireWeekDispatchLockMock.mockResolvedValue(true);
    generateDispatchContentMock.mockResolvedValue(dispatch);

    const response = await GET(
      createRequest({
        authorization: "Bearer cron-secret",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(generateDispatchContentMock).toHaveBeenCalledWith({
      weekId: "2026-03-16",
      submissions,
    });
    expect(markWeekDispatchCompleteMock).toHaveBeenCalledWith("2026-03-16");
    expect(payload).toEqual({
      status: "ready_for_delivery",
      weekId: "2026-03-16",
      submissionCount: 2,
      dispatch,
      delivery: {
        channel: "email",
        ready: true,
      },
    });
  });

  it("prevents duplicate weekly runs via idempotency lock", async () => {
    listCurrentWeekSubmissionsMock.mockResolvedValue([
      {
        author: "Rohit",
        content: "Existing submission",
        timestamp: "2026-03-20T08:00:00.000Z",
      },
    ]);
    acquireWeekDispatchLockMock.mockResolvedValue(false);

    const response = await GET(
      createRequest({
        authorization: "Bearer cron-secret",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      status: "already_processed",
      weekId: "2026-03-16",
      submissionCount: 1,
    });
    expect(generateDispatchContentMock).not.toHaveBeenCalled();
    expect(markWeekDispatchCompleteMock).not.toHaveBeenCalled();
    expect(releaseWeekDispatchLockMock).not.toHaveBeenCalled();
  });

  it("releases lock and returns 500 when generation fails", async () => {
    const submissions: Submission[] = [
      {
        author: "Rohit",
        content: "Existing submission",
        timestamp: "2026-03-20T08:00:00.000Z",
      },
    ];

    listCurrentWeekSubmissionsMock.mockResolvedValue(submissions);
    acquireWeekDispatchLockMock.mockResolvedValue(true);
    generateDispatchContentMock.mockRejectedValue(new Error("generation failure"));

    const response = await GET(
      createRequest({
        authorization: "Bearer cron-secret",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      status: "generation_failed",
      weekId: "2026-03-16",
      submissionCount: 1,
    });
    expect(releaseWeekDispatchLockMock).toHaveBeenCalledWith("2026-03-16");
    expect(markWeekDispatchCompleteMock).not.toHaveBeenCalled();
  });
});
