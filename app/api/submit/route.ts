import { NextResponse } from "next/server";

import { saveSubmission } from "@/lib/submissions";
import { submitRequestSchema } from "@/lib/validation";

const INVALID_PAYLOAD_MESSAGE = "Invalid request payload";

function buildInvalidPayloadResponse(fieldErrors: Record<string, string[] | undefined>) {
  return NextResponse.json(
    {
      success: false,
      error: {
        message: INVALID_PAYLOAD_MESSAGE,
        fieldErrors,
      },
    },
    {
      status: 400,
    },
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return buildInvalidPayloadResponse({});
  }

  const parsed = submitRequestSchema.safeParse(body);

  if (!parsed.success) {
    return buildInvalidPayloadResponse(parsed.error.flatten().fieldErrors);
  }

  const submission = await saveSubmission(parsed.data);

  return NextResponse.json(
    {
      success: true,
      submission,
    },
    {
      status: 201,
    },
  );
}
