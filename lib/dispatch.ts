import type { DispatchContent, Submission, WeekId } from "@/lib/types";

export interface GenerateDispatchContentInput {
  weekId: WeekId;
  submissions: Submission[];
}

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

export async function generateDispatchContent({
  weekId,
  submissions,
}: GenerateDispatchContentInput): Promise<DispatchContent> {
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
