import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DispatchContent, Submission } from "@/lib/types";

const {
  getEnvMock,
  listCurrentWeekSubmissionsMock,
  acquireWeekDispatchLockMock,
  markWeekDispatchCompleteMock,
  releaseWeekDispatchLockMock,
  archiveAndClearCurrentWeekMock,
  generateDispatchContentMock,
  sendWeeklyDispatchMock,
  runWithTelemetryMock,
} = vi.hoisted(() => ({
  getEnvMock: vi.fn(),
  listCurrentWeekSubmissionsMock: vi.fn(),
  acquireWeekDispatchLockMock: vi.fn(),
  markWeekDispatchCompleteMock: vi.fn(),
  releaseWeekDispatchLockMock: vi.fn(),
  archiveAndClearCurrentWeekMock: vi.fn(),
  generateDispatchContentMock: vi.fn(),
  sendWeeklyDispatchMock: vi.fn(),
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
  archiveAndClearCurrentWeek: archiveAndClearCurrentWeekMock,
}));

vi.mock("@/lib/dispatch", () => ({
  generateDispatchContent: generateDispatchContentMock,
}));

vi.mock("@/lib/email", () => ({
  sendWeeklyDispatch: sendWeeklyDispatchMock,
}));

vi.mock("@/lib/telemetry", () => ({
  runWithTelemetry: runWithTelemetryMock,
}));

import { GET } from "../../app/api/cron/generate/route";

function createRequestUrl(query?: string): string {
  const baseUrl = "http://localhost/api/cron/generate";
  return query ? `${baseUrl}?${query}` : baseUrl;
}

function createRequest(
  headers: Record<string, string> = {},
  query?: string,
): Request {
  return new Request(createRequestUrl(query), {
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
    archiveAndClearCurrentWeekMock.mockReset();
    generateDispatchContentMock.mockReset();
    sendWeeklyDispatchMock.mockReset();
    runWithTelemetryMock.mockReset();

    getEnvMock.mockReturnValue({
      CRON_SECRET: "cron-secret",
    });

    runWithTelemetryMock.mockImplementation(
      async (_spanName: string, callback: () => Promise<unknown>) => callback(),
    );

    markWeekDispatchCompleteMock.mockResolvedValue(undefined);
    releaseWeekDispatchLockMock.mockResolvedValue(undefined);
    archiveAndClearCurrentWeekMock.mockResolvedValue({
      sourceKey: "dispatch:submissions:current_week:2026-03-16",
      archiveKey: "dispatch:submissions:archive:2026-03-16",
      archivedCount: 2,
    });
    sendWeeklyDispatchMock.mockResolvedValue({
      provider: "resend",
      audienceId: "audience_123",
      broadcastId: "broadcast_123",
    });
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
      trigger: "scheduled",
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

  it("returns scheduled trigger mode when trigger param is omitted", async () => {
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
      trigger: "scheduled",
      weekId: "2026-03-16",
      submissionCount: 0,
    });
    expect(acquireWeekDispatchLockMock).not.toHaveBeenCalled();
    expect(generateDispatchContentMock).not.toHaveBeenCalled();
  });

  it("returns manual trigger mode when trigger=manual is provided", async () => {
    listCurrentWeekSubmissionsMock.mockResolvedValue([]);

    const response = await GET(
      createRequest(
        {
          authorization: "Bearer cron-secret",
        },
        "trigger=manual",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "no_submissions",
      trigger: "manual",
      weekId: "2026-03-16",
      submissionCount: 0,
    });
    expect(acquireWeekDispatchLockMock).not.toHaveBeenCalled();
    expect(generateDispatchContentMock).not.toHaveBeenCalled();
  });

  it("falls back to scheduled when trigger value is not an exact match", async () => {
    listCurrentWeekSubmissionsMock.mockResolvedValue([]);

    const response = await GET(
      createRequest(
        {
          authorization: "Bearer cron-secret",
        },
        "trigger=MANUAL",
      ),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      status: "no_submissions",
      trigger: "scheduled",
      weekId: "2026-03-16",
      submissionCount: 0,
    });
    expect(acquireWeekDispatchLockMock).not.toHaveBeenCalled();
    expect(generateDispatchContentMock).not.toHaveBeenCalled();
  });

  it("generates dispatch content, sends delivery, and archives the weekly source", async () => {
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
    expect(sendWeeklyDispatchMock).toHaveBeenCalledWith({
      dispatch,
    });
    expect(archiveAndClearCurrentWeekMock).toHaveBeenCalledTimes(1);
    expect(markWeekDispatchCompleteMock).toHaveBeenCalledWith("2026-03-16");
    expect(payload).toEqual({
      status: "sent",
      trigger: "scheduled",
      weekId: "2026-03-16",
      submissionCount: 2,
      dispatch,
      delivery: {
        channel: "email",
        provider: "resend",
        audienceId: "audience_123",
        broadcastId: "broadcast_123",
      },
      archive: {
        sourceKey: "dispatch:submissions:current_week:2026-03-16",
        archiveKey: "dispatch:submissions:archive:2026-03-16",
        archivedCount: 2,
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
      trigger: "scheduled",
      weekId: "2026-03-16",
      submissionCount: 1,
    });
    expect(generateDispatchContentMock).not.toHaveBeenCalled();
    expect(sendWeeklyDispatchMock).not.toHaveBeenCalled();
    expect(archiveAndClearCurrentWeekMock).not.toHaveBeenCalled();
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
      trigger: "scheduled",
      weekId: "2026-03-16",
      submissionCount: 1,
    });
    expect(releaseWeekDispatchLockMock).toHaveBeenCalledWith("2026-03-16");
    expect(sendWeeklyDispatchMock).not.toHaveBeenCalled();
    expect(archiveAndClearCurrentWeekMock).not.toHaveBeenCalled();
    expect(markWeekDispatchCompleteMock).not.toHaveBeenCalled();
  });

  it("releases lock, does not archive, and returns 502 when delivery fails", async () => {
    const submissions: Submission[] = [
      {
        author: "Rohit",
        content: "Existing submission",
        timestamp: "2026-03-20T08:00:00.000Z",
      },
    ];

    const dispatch: DispatchContent = {
      subject: "Weekend Dispatch - 2026-03-16",
      preview: "One update this week",
      markdown: "## The Weekend Dispatch\n\n- Rohit: Existing submission",
    };

    listCurrentWeekSubmissionsMock.mockResolvedValue(submissions);
    acquireWeekDispatchLockMock.mockResolvedValue(true);
    generateDispatchContentMock.mockResolvedValue(dispatch);
    sendWeeklyDispatchMock.mockRejectedValue(new Error("delivery failure"));

    const response = await GET(
      createRequest({
        authorization: "Bearer cron-secret",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      status: "delivery_failed",
      trigger: "scheduled",
      weekId: "2026-03-16",
      submissionCount: 1,
    });
    expect(archiveAndClearCurrentWeekMock).not.toHaveBeenCalled();
    expect(markWeekDispatchCompleteMock).not.toHaveBeenCalled();
    expect(releaseWeekDispatchLockMock).toHaveBeenCalledWith("2026-03-16");
  });

  it("releases lock and returns 502 when markWeekDispatchComplete fails", async () => {
    const submissions: Submission[] = [
      {
        author: "Rohit",
        content: "Existing submission",
        timestamp: "2026-03-20T08:00:00.000Z",
      },
    ];

    const dispatch: DispatchContent = {
      subject: "Weekend Dispatch - 2026-03-16",
      preview: "One update this week",
      markdown: "## The Weekend Dispatch\n\n- Rohit: Existing submission",
    };

    listCurrentWeekSubmissionsMock.mockResolvedValue(submissions);
    acquireWeekDispatchLockMock.mockResolvedValue(true);
    generateDispatchContentMock.mockResolvedValue(dispatch);
    archiveAndClearCurrentWeekMock.mockResolvedValue({
      sourceKey: "dispatch:submissions:current_week:2026-03-16",
      archiveKey: "dispatch:submissions:archive:2026-03-16",
      archivedCount: 1,
    });
    markWeekDispatchCompleteMock.mockRejectedValue(
      new Error("Redis connection failed"),
    );

    const response = await GET(
      createRequest({
        authorization: "Bearer cron-secret",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload).toEqual({
      status: "completion_failed",
      trigger: "scheduled",
      weekId: "2026-03-16",
      submissionCount: 1,
    });
    expect(sendWeeklyDispatchMock).toHaveBeenCalledWith({
      dispatch,
    });
    expect(archiveAndClearCurrentWeekMock).toHaveBeenCalledTimes(1);
    expect(markWeekDispatchCompleteMock).toHaveBeenCalledWith("2026-03-16");
    expect(releaseWeekDispatchLockMock).toHaveBeenCalledWith("2026-03-16");
  });
});
