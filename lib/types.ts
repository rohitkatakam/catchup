export type WeekId = `${number}-${string}-${string}`;

export type ISO8601Timestamp = string;

export interface SubmissionInput {
  author: string;
  content: string;
}

export interface Submission extends SubmissionInput {
  timestamp: ISO8601Timestamp;
}

export interface DispatchResult {
  weekId: WeekId;
  archivedCount: number;
  sent: boolean;
  messageId?: string;
}
