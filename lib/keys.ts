import type { WeekId } from "@/lib/types";

const DISPATCH_NAMESPACE = "dispatch";

function formatDatePart(value: number): string {
  return value.toString().padStart(2, "0");
}

function getStartOfWeekUtc(date: Date): Date {
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;

  const startOfWeek = new Date(date);
  startOfWeek.setUTCHours(0, 0, 0, 0);
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - daysSinceMonday);

  return startOfWeek;
}

export function getWeekId(date: Date = new Date()): WeekId {
  const startOfWeek = getStartOfWeekUtc(date);
  const year = startOfWeek.getUTCFullYear();
  const month = formatDatePart(startOfWeek.getUTCMonth() + 1);
  const day = formatDatePart(startOfWeek.getUTCDate());

  return `${year}-${month}-${day}`;
}

export function getCurrentWeekSubmissionsKey(date: Date = new Date()): string {
  return `${DISPATCH_NAMESPACE}:submissions:current_week:${getWeekId(date)}`;
}

export function getWeekArchiveKey(weekId: WeekId): string {
  return `${DISPATCH_NAMESPACE}:submissions:archive:${weekId}`;
}

export function getWeekSendLockKey(weekId: WeekId): string {
  return `${DISPATCH_NAMESPACE}:dispatch_sent:${weekId}`;
}
