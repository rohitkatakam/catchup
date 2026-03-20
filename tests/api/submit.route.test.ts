import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveSubmissionMock } = vi.hoisted(() => ({
  saveSubmissionMock: vi.fn(),
}));

vi.mock("@/lib/submissions", () => ({
  saveSubmission: saveSubmissionMock,
}));

import { POST } from "@/app/api/submit/route";

function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function createInvalidJsonRequest(rawBody: string): Request {
  return new Request("http://localhost/api/submit", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: rawBody,
  });
}

describe("POST /api/submit", () => {
  beforeEach(() => {
    saveSubmissionMock.mockReset();
  });

  it("returns success status for a valid payload", async () => {
    saveSubmissionMock.mockResolvedValue({
      author: "Rohit",
      content: "Shipped phase 3",
      timestamp: "2026-03-20T15:00:00.000Z",
    });

    const response = await POST(
      createJsonRequest({
        author: "Rohit",
        content: "Shipped phase 3",
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({
      success: true,
      submission: {
        author: "Rohit",
        content: "Shipped phase 3",
        timestamp: "2026-03-20T15:00:00.000Z",
      },
    });
  });

  it("returns 400 for malformed JSON body", async () => {
    const response = await POST(createInvalidJsonRequest('{"author": "Rohit",'));

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({
      success: false,
      error: {
        message: "Invalid request payload",
        fieldErrors: {},
      },
    });
    expect(saveSubmissionMock).not.toHaveBeenCalled();
  });

  it("returns 400 for missing or invalid fields", async () => {
    const response = await POST(
      createJsonRequest({
        author: "   ",
      }),
    );

    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.success).toBe(false);
    expect(payload.error.message).toBe("Invalid request payload");
    expect(payload.error.fieldErrors).toHaveProperty("author");
    expect(payload.error.fieldErrors).toHaveProperty("content");
    expect(saveSubmissionMock).not.toHaveBeenCalled();
  });

  it("persists normalized input and returns timestamped record from persistence layer", async () => {
    saveSubmissionMock.mockResolvedValue({
      author: "Nina",
      content: "Weekly update",
      timestamp: "2026-03-20T16:00:00.000Z",
    });

    const response = await POST(
      createJsonRequest({
        author: "  Nina  ",
        content: "  Weekly update  ",
      }),
    );

    const payload = await response.json();

    expect(saveSubmissionMock).toHaveBeenCalledTimes(1);
    expect(saveSubmissionMock).toHaveBeenCalledWith({
      author: "Nina",
      content: "Weekly update",
    });
    expect(response.status).toBe(201);
    expect(payload.submission.timestamp).toBe("2026-03-20T16:00:00.000Z");
  });
});
