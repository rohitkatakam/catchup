import {
  getCurrentWeekSubmissionsKey,
  getWeekArchiveKey,
  getWeekId,
  getWeekSendLockKey,
} from "@/lib/keys";
import { getRedisClient } from "@/lib/redis";
import type { Submission, SubmissionInput, WeekId } from "@/lib/types";

const WEEK_DISPATCH_IN_FLIGHT_TTL_SECONDS = 60 * 60 * 24;
const WEEK_DISPATCH_COMPLETE_TTL_SECONDS = 60 * 60 * 24 * 8;

interface ParsedSubmission {
  submission: Submission;
  originalIndex: number;
}

function parseSubmission(rawValue: string): Submission | null {
  try {
    const parsed = JSON.parse(rawValue) as Partial<Submission>;

    if (
      typeof parsed.author !== "string" ||
      typeof parsed.content !== "string" ||
      typeof parsed.timestamp !== "string"
    ) {
      return null;
    }

    if (Number.isNaN(Date.parse(parsed.timestamp))) {
      return null;
    }

    return {
      author: parsed.author,
      content: parsed.content,
      timestamp: parsed.timestamp,
    };
  } catch {
    return null;
  }
}

export async function saveSubmission(
  input: SubmissionInput,
  now: Date = new Date(),
): Promise<Submission> {
  const redis = getRedisClient();
  const currentWeekKey = getCurrentWeekSubmissionsKey(now);
  const submission: Submission = {
    author: input.author,
    content: input.content,
    timestamp: now.toISOString(),
  };

  await redis.rpush(currentWeekKey, JSON.stringify(submission));

  return submission;
}

export async function listCurrentWeekSubmissions(now: Date = new Date()): Promise<Submission[]> {
  const redis = getRedisClient();
  const currentWeekKey = getCurrentWeekSubmissionsKey(now);
  const rawSubmissions = await redis.lrange<string>(currentWeekKey, 0, -1);

  const parsedSubmissions = rawSubmissions
    .map((rawSubmission, index): ParsedSubmission | null => {
      const submission = parseSubmission(rawSubmission);

      if (!submission) {
        return null;
      }

      return {
        submission,
        originalIndex: index,
      };
    })
    .filter((parsed): parsed is ParsedSubmission => parsed !== null);

  return parsedSubmissions
    .sort((left, right) => {
      const timestampDifference =
        Date.parse(left.submission.timestamp) - Date.parse(right.submission.timestamp);

      if (timestampDifference !== 0) {
        return timestampDifference;
      }

      return left.originalIndex - right.originalIndex;
    })
    .map((parsed) => parsed.submission);
}

export async function acquireWeekDispatchLock(
  weekId: WeekId,
  now: Date = new Date(),
): Promise<boolean> {
  const redis = getRedisClient();
  const lockKey = getWeekSendLockKey(weekId);
  const result = await redis.set(lockKey, `in_flight:${now.toISOString()}`, {
    nx: true,
    ex: WEEK_DISPATCH_IN_FLIGHT_TTL_SECONDS,
  });

  return result === "OK";
}

export async function markWeekDispatchComplete(
  weekId: WeekId,
  now: Date = new Date(),
): Promise<void> {
  const redis = getRedisClient();
  const lockKey = getWeekSendLockKey(weekId);

  await redis.set(lockKey, `completed:${now.toISOString()}`, {
    ex: WEEK_DISPATCH_COMPLETE_TTL_SECONDS,
  });
}

export async function releaseWeekDispatchLock(weekId: WeekId): Promise<void> {
  const redis = getRedisClient();
  const lockKey = getWeekSendLockKey(weekId);

  await redis.del(lockKey);
}

export interface ArchiveResult {
  sourceKey: string;
  archiveKey: string;
  archivedCount: number;
}

export async function archiveAndClearCurrentWeek(now: Date = new Date()): Promise<ArchiveResult> {
  const redis = getRedisClient();
  const weekId = getWeekId(now);
  const sourceKey = getCurrentWeekSubmissionsKey(now);
  const archiveKey = getWeekArchiveKey(weekId);
  const rawSubmissions = await redis.lrange<string>(sourceKey, 0, -1);
  const archivedCount = rawSubmissions.length;

  if (archivedCount > 0) {
    await redis.rpush(archiveKey, ...rawSubmissions);
    // Trim only the copied range so submissions appended during rollover are preserved.
    await redis.ltrim(sourceKey, archivedCount, -1);
  }

  return {
    sourceKey,
    archiveKey,
    archivedCount,
  };
}
