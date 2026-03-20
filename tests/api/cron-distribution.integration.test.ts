import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentWeekSubmissionsKey, getWeekArchiveKey, getWeekSendLockKey } from "@/lib/keys";
import { saveSubmission } from "@/lib/submissions";
import type { DispatchContent, WeekId } from "@/lib/types";

vi.mock("server-only", () => ({}));

interface RedisSetOptions {
  nx?: boolean;
  ex?: number;
}

const {
  getEnvMock,
  generateDispatchContentMock,
  sendWeeklyDispatchMock,
  runWithTelemetryMock,
  redisMock,
  state,
} = vi.hoisted(() => {
  const listStore = new Map<string, string[]>();
  const kvStore = new Map<string, string>();

  const redis = {
    async rpush(key: string, ...values: string[]) {
      const current = listStore.get(key) ?? [];
      current.push(...values);
      listStore.set(key, current);
      return current.length;
    },
    async lrange(key: string, start: number, stop: number) {
      const current = listStore.get(key) ?? [];
      const normalizedStop = stop < 0 ? current.length - 1 : stop;
      if (current.length === 0 || start > normalizedStop) {
        return [];
      }

      return current.slice(start, normalizedStop + 1);
    },
    async ltrim(key: string, start: number, stop: number) {
      const current = listStore.get(key) ?? [];
      const normalizedStop = stop < 0 ? current.length - 1 : stop;
      const trimmed = start > normalizedStop ? [] : current.slice(start, normalizedStop + 1);
      listStore.set(key, trimmed);
      return "OK";
    },
    async set(key: string, value: string, options?: RedisSetOptions) {
      if (options?.nx && kvStore.has(key)) {
        return null;
      }

      kvStore.set(key, value);
      return "OK";
    },
    async del(key: string) {
      kvStore.delete(key);
      return 1;
    },
  };

  return {
    getEnvMock: vi.fn(),
    generateDispatchContentMock: vi.fn(),
    sendWeeklyDispatchMock: vi.fn(),
    runWithTelemetryMock: vi.fn(),
    redisMock: redis,
    state: {
      listStore,
      kvStore,
    },
  };
});

vi.mock("@/lib/env", () => ({
  getEnv: getEnvMock,
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

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => redisMock,
}));

import { GET } from "@/app/api/cron/generate/route";

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/generate", {
    method: "GET",
    headers,
  });
}

const dispatch: DispatchContent = {
  subject: "Weekend Dispatch - 2026-03-16",
  preview: "2 updates this week",
  markdown: "## The Weekend Dispatch\n\n- Rohit: update\n- Nina: update",
};

describe("GET /api/cron/generate distribution lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T10:00:00.000Z"));

    state.listStore.clear();
    state.kvStore.clear();

    getEnvMock.mockReset();
    generateDispatchContentMock.mockReset();
    sendWeeklyDispatchMock.mockReset();
    runWithTelemetryMock.mockReset();

    getEnvMock.mockReturnValue({
      CRON_SECRET: "cron-secret",
    });

    runWithTelemetryMock.mockImplementation(
      async (_spanName: string, callback: () => Promise<unknown>) => callback(),
    );

    generateDispatchContentMock.mockResolvedValue(dispatch);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("archives and clears source list only after successful delivery", async () => {
    const now = new Date("2026-03-20T10:00:00.000Z");
    const weekId = "2026-03-16" as WeekId;

    await saveSubmission(
      {
        author: "Rohit",
        content: "Shipped phase 6",
      },
      now,
    );
    await saveSubmission(
      {
        author: "Nina",
        content: "Wrapped integration tests",
      },
      now,
    );

    sendWeeklyDispatchMock.mockResolvedValue({
      provider: "resend",
      audienceId: "audience_123",
      broadcastId: "broadcast_123",
    });

    const response = await GET(
      createRequest({
        authorization: "Bearer cron-secret",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.status).toBe("sent");
    expect(payload.archive).toEqual({
      archivedCount: 2,
      archiveKey: getWeekArchiveKey(weekId),
      sourceKey: getCurrentWeekSubmissionsKey(now),
    });

    expect(state.listStore.get(getCurrentWeekSubmissionsKey(now))).toEqual([]);
    expect(state.listStore.get(getWeekArchiveKey(weekId))).toHaveLength(2);
    expect(state.kvStore.get(getWeekSendLockKey(weekId))).toContain("completed:");
  });

  it("leaves source data untouched when email delivery fails", async () => {
    const now = new Date("2026-03-20T10:00:00.000Z");
    const weekId = "2026-03-16" as WeekId;

    await saveSubmission(
      {
        author: "Rohit",
        content: "This should remain in source",
      },
      now,
    );

    sendWeeklyDispatchMock.mockRejectedValue(new Error("resend unavailable"));

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
      weekId,
      submissionCount: 1,
    });

    expect(state.listStore.get(getCurrentWeekSubmissionsKey(now))).toHaveLength(1);
    expect(state.listStore.get(getWeekArchiveKey(weekId))).toBeUndefined();
    expect(state.kvStore.get(getWeekSendLockKey(weekId))).toBeUndefined();
  });
});
