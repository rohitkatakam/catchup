import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { redisMock } = vi.hoisted(() => ({
  redisMock: {
    rpush: vi.fn(),
    lrange: vi.fn(),
    ltrim: vi.fn(),
  },
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => redisMock,
}));

import {
  getCurrentWeekSubmissionsKey,
  getWeekArchiveKey,
  getWeekId,
} from "@/lib/keys";
import {
  archiveAndClearCurrentWeek,
  listCurrentWeekSubmissions,
  saveSubmission,
} from "@/lib/submissions";

describe("keys", () => {
  it("generates deterministic weekly keys from a date", () => {
    const date = new Date("2026-03-20T10:45:00.000Z");

    expect(getWeekId(date)).toBe("2026-03-16");
    expect(getCurrentWeekSubmissionsKey(date)).toBe("dispatch:submissions:current_week:2026-03-16");
    expect(getWeekArchiveKey(getWeekId(date))).toBe("dispatch:submissions:archive:2026-03-16");
  });
});

describe("submissions", () => {
  beforeEach(() => {
    redisMock.rpush.mockReset();
    redisMock.lrange.mockReset();
    redisMock.ltrim.mockReset();
  });

  it("saves submission JSON into the current-week list", async () => {
    redisMock.rpush.mockResolvedValue(1);

    const now = new Date("2026-03-20T12:00:00.000Z");
    await saveSubmission(
      {
        author: "Rohit",
        content: "Shipped phase 2",
      },
      now,
    );

    expect(redisMock.rpush).toHaveBeenCalledTimes(1);
    const [key, payload] = redisMock.rpush.mock.calls[0] as [string, string];

    expect(key).toBe("dispatch:submissions:current_week:2026-03-16");
    expect(JSON.parse(payload)).toEqual({
      author: "Rohit",
      content: "Shipped phase 2",
      timestamp: "2026-03-20T12:00:00.000Z",
    });
  });

  it("lists submissions parsed from JSON in stable chronological order", async () => {
    redisMock.lrange.mockResolvedValue([
      JSON.stringify({
        author: "Nina",
        content: "Late morning update",
        timestamp: "2026-03-20T11:00:00.000Z",
      }),
      JSON.stringify({
        author: "Alex",
        content: "Early update",
        timestamp: "2026-03-20T09:00:00.000Z",
      }),
      JSON.stringify({
        author: "Priya",
        content: "Same time as Nina",
        timestamp: "2026-03-20T11:00:00.000Z",
      }),
    ]);

    const now = new Date("2026-03-20T12:00:00.000Z");
    const submissions = await listCurrentWeekSubmissions(now);

    expect(redisMock.lrange).toHaveBeenCalledWith(
      "dispatch:submissions:current_week:2026-03-16",
      0,
      -1,
    );
    expect(submissions.map((submission) => submission.author)).toEqual(["Alex", "Nina", "Priya"]);
  });

  it("archives current-week submissions and clears the source list", async () => {
    const sourceEntries = [
      JSON.stringify({
        author: "Rohit",
        content: "Week recap",
        timestamp: "2026-03-20T11:00:00.000Z",
      }),
      JSON.stringify({
        author: "Nina",
        content: "Another recap",
        timestamp: "2026-03-20T11:30:00.000Z",
      }),
    ];

    redisMock.lrange.mockResolvedValue(sourceEntries);
    redisMock.rpush.mockResolvedValue(2);
    redisMock.ltrim.mockResolvedValue("OK");

    const now = new Date("2026-03-20T12:00:00.000Z");
    const result = await archiveAndClearCurrentWeek(now);

    expect(redisMock.lrange).toHaveBeenCalledWith(
      "dispatch:submissions:current_week:2026-03-16",
      0,
      -1,
    );
    expect(redisMock.rpush).toHaveBeenCalledWith(
      "dispatch:submissions:archive:2026-03-16",
      ...sourceEntries,
    );
    expect(redisMock.ltrim).toHaveBeenCalledWith(
      "dispatch:submissions:current_week:2026-03-16",
      2,
      -1,
    );
    expect(result).toEqual({
      archivedCount: 2,
      archiveKey: "dispatch:submissions:archive:2026-03-16",
      sourceKey: "dispatch:submissions:current_week:2026-03-16",
    });
  });
});
