import "server-only";

import { Resend } from "resend";

import { getEnv } from "@/lib/env";
import type { DispatchContent } from "@/lib/types";

export interface SendWeeklyDispatchInput {
  dispatch: DispatchContent;
}

export interface SendCallForSubmissionsInput {
  submissionUrl: string;
}

export interface DeliveryMetadata {
  provider: "resend";
  audienceId: string;
  broadcastId: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildHtmlBody(dispatch: DispatchContent): string {
  const escapedPreview = escapeHtml(dispatch.preview);
  const escapedMarkdown = escapeHtml(dispatch.markdown).replaceAll("\n", "<br />");

  return [
    "<article>",
    `<p>${escapedPreview}</p>`,
    `<p>${escapedMarkdown}</p>`,
    "</article>",
  ].join("");
}

function buildTextBody(dispatch: DispatchContent): string {
  return [dispatch.preview, "", dispatch.markdown].join("\n");
}

export async function sendWeeklyDispatch({ dispatch }: SendWeeklyDispatchInput): Promise<DeliveryMetadata> {
  const { RESEND_API_KEY, DISPATCH_FROM_EMAIL, DISPATCH_AUDIENCE_ID } = getEnv();

  const resend = new Resend(RESEND_API_KEY);
  const result = await resend.broadcasts.create({
    from: DISPATCH_FROM_EMAIL,
    subject: dispatch.subject,
    html: buildHtmlBody(dispatch),
    text: buildTextBody(dispatch),
    audienceId: DISPATCH_AUDIENCE_ID,
    send: true,
  });

  if (result.error) {
    throw new Error(`Failed to send dispatch broadcast: ${result.error.message}`);
  }

  const broadcastId = result.data?.id;

  if (!broadcastId) {
    throw new Error("Failed to send dispatch broadcast: missing broadcast id in response");
  }

  return {
    provider: "resend",
    audienceId: DISPATCH_AUDIENCE_ID,
    broadcastId,
  };
}

function buildPromptHtmlBody(submissionUrl: string): string {
  const escapedUrl = escapeHtml(submissionUrl);

  return [
    "<article>",
    "<p>It is time for this week&rsquo;s Weekend Dispatch.</p>",
    "<p>Share your update using the link below:</p>",
    `<p><a href="${escapedUrl}">${escapedUrl}</a></p>`,
    "</article>",
  ].join("");
}

function buildPromptTextBody(submissionUrl: string): string {
  return [
    "It is time for this week's Weekend Dispatch.",
    "",
    "Share your update here:",
    submissionUrl,
  ].join("\n");
}

export async function sendCallForSubmissions({
  submissionUrl,
}: SendCallForSubmissionsInput): Promise<DeliveryMetadata> {
  const { RESEND_API_KEY, DISPATCH_FROM_EMAIL, DISPATCH_AUDIENCE_ID } = getEnv();

  const resend = new Resend(RESEND_API_KEY);
  const result = await resend.broadcasts.create({
    from: DISPATCH_FROM_EMAIL,
    subject: "Weekend Dispatch — your update",
    html: buildPromptHtmlBody(submissionUrl),
    text: buildPromptTextBody(submissionUrl),
    audienceId: DISPATCH_AUDIENCE_ID,
    send: true,
  });

  if (result.error) {
    throw new Error(`Failed to send call-for-submissions broadcast: ${result.error.message}`);
  }

  const broadcastId = result.data?.id;

  if (!broadcastId) {
    throw new Error("Failed to send call-for-submissions broadcast: missing broadcast id in response");
  }

  return {
    provider: "resend",
    audienceId: DISPATCH_AUDIENCE_ID,
    broadcastId,
  };
}
