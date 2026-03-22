import "server-only";

import { createGateway, generateText } from "ai";
import { z } from "zod";

import { getEnv } from "@/lib/env";
import type { DispatchContent, Submission, WeekId } from "@/lib/types";

export interface GenerateDispatchContentInput {
  weekId: WeekId;
  submissions: Submission[];
}

const dispatchContentSchema = z.object({
  subject: z.string().min(1),
  preview: z.string().min(1),
  markdown: z.string().min(1),
});

function joinAuthorNames(authors: string[]): string {
  if (authors.length === 0) {
    return "no one";
  }

  if (authors.length === 1) {
    return authors[0];
  }

  if (authors.length === 2) {
    return `${authors[0]} and ${authors[1]}`;
  }

  const leadingAuthors = authors.slice(0, -1).join(", ");
  const finalAuthor = authors[authors.length - 1];

  return `${leadingAuthors}, and ${finalAuthor}`;
}

function buildFallbackDispatchContent(weekId: WeekId, submissions: Submission[]): DispatchContent {
  const uniqueAuthors = Array.from(new Set(submissions.map((submission) => submission.author)));
  const submissionCount = submissions.length;
  const submissionLabel = submissionCount === 1 ? "update" : "updates";

  return {
    subject: `Weekend Dispatch - ${weekId}`,
    preview: `${submissionCount} ${submissionLabel} this week from ${joinAuthorNames(uniqueAuthors)}`,
    markdown: [
      "## The Weekend Dispatch",
      "",
      `Week of ${weekId}`,
      "",
      ...submissions.map((submission) => `- ${submission.author}: ${submission.content}`),
    ].join("\n"),
  };
}

function parseDispatchJson(text: string): DispatchContent | null {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  try {
    const parsed: unknown = JSON.parse(candidate);
    const result = dispatchContentSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function generateDispatchContent({
  weekId,
  submissions,
}: GenerateDispatchContentInput): Promise<DispatchContent> {
  const fallback = buildFallbackDispatchContent(weekId, submissions);

  const { AI_GATEWAY_API_KEY, DISPATCH_MODEL } = getEnv();
  const gatewayProvider = createGateway({
    apiKey: AI_GATEWAY_API_KEY,
  });

  const submissionsBlock = submissions
    .map(
      (s, i) =>
        `${i + 1}. Author: ${s.author}\n   Timestamp: ${s.timestamp}\n   Content:\n   ${s.content.replace(/\n/g, "\n   ")}`,
    )
    .join("\n\n");

  const userPrompt = [
    `Week identifier: ${weekId}`,
    "",
    "Submissions:",
    submissionsBlock,
    "",
    'Respond with a single JSON object only (no markdown outside the JSON). Keys: "subject" (email subject line), "preview" (one-line teaser), "markdown" (full newsletter body in markdown).',
    "Synthesize a cohesive Sunday-style group newsletter from these updates; preserve distinct voices where helpful.",
  ].join("\n");

  try {
    const { text } = await generateText({
      model: gatewayProvider.languageModel(DISPATCH_MODEL),
      system:
        "You are an editor for a small friend group's weekly email digest. Output valid JSON only matching the requested shape.",
      prompt: userPrompt,
    });

    const parsed = parseDispatchJson(text);
    if (parsed) {
      return parsed;
    }

    return fallback;
  } catch {
    return fallback;
  }
}
