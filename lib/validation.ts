import { z } from "zod";

const nonEmptyTrimmedString = z.string().trim().min(1, "Required");

export const submitRequestSchema = z.object({
  author: nonEmptyTrimmedString,
  content: nonEmptyTrimmedString,
});

export type SubmitRequest = z.infer<typeof submitRequestSchema>;
