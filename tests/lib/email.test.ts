import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DispatchContent } from "@/lib/types";

vi.mock("server-only", () => ({}));

const { getEnvMock, sendEmailMock, ResendMock } = vi.hoisted(() => {
  const send = vi.fn();

  return {
    getEnvMock: vi.fn(),
    sendEmailMock: send,
    ResendMock: vi.fn().mockImplementation(function MockResend() {
      return {
        broadcasts: {
          create: send,
        },
      };
    }),
  };
});

vi.mock("@/lib/env", () => ({
  getEnv: getEnvMock,
}));

vi.mock("resend", () => ({
  Resend: ResendMock,
}));

import { sendCallForSubmissions, sendWeeklyDispatch } from "@/lib/email";

const dispatch: DispatchContent = {
  subject: "Weekend Dispatch - 2026-03-16",
  preview: "2 updates this week",
  markdown: "## The Weekend Dispatch\n\n- Rohit: Shipped phase 5\n- Nina: Closed onboarding",
};

describe("sendWeeklyDispatch", () => {
  beforeEach(() => {
    getEnvMock.mockReset();
    sendEmailMock.mockReset();
    ResendMock.mockClear();

    getEnvMock.mockReturnValue({
      RESEND_API_KEY: "re_test_key",
      DISPATCH_FROM_EMAIL: "dispatch@example.com",
      DISPATCH_AUDIENCE_ID: "audience_123",
      DISPATCH_APP_URL: "https://dispatch.example.com",
    });

    sendEmailMock.mockResolvedValue({
      data: {
        id: "broadcast_123",
      },
      error: null,
    });
  });

  it("sends to configured audience id via broadcasts API", async () => {
    await sendWeeklyDispatch({
      dispatch,
    });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceId: "audience_123",
        send: true,
      }),
    );
  });

  it("sends expected subject/html/text payload and returns delivery metadata", async () => {
    const result = await sendWeeklyDispatch({
      dispatch,
    });

    expect(sendEmailMock).toHaveBeenCalledWith({
      from: "dispatch@example.com",
      subject: "Weekend Dispatch - 2026-03-16",
      html: expect.stringContaining("2 updates this week"),
      text: expect.stringContaining("## The Weekend Dispatch"),
      audienceId: "audience_123",
      send: true,
    });

    expect(result).toEqual({
      provider: "resend",
      audienceId: "audience_123",
      broadcastId: "broadcast_123",
    });
  });

  it("throws error when Resend API returns error response", async () => {
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { message: "Failed to authenticate" },
    });

    await expect(sendWeeklyDispatch({ dispatch })).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining("Failed to send dispatch broadcast"),
      }),
    );
  });

  it("throws error when broadcast id is missing in success response", async () => {
    sendEmailMock.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(sendWeeklyDispatch({ dispatch })).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining("missing broadcast id"),
      }),
    );
  });
});

describe("sendCallForSubmissions", () => {
  beforeEach(() => {
    getEnvMock.mockReset();
    sendEmailMock.mockReset();
    ResendMock.mockClear();

    getEnvMock.mockReturnValue({
      RESEND_API_KEY: "re_test_key",
      DISPATCH_FROM_EMAIL: "dispatch@example.com",
      DISPATCH_AUDIENCE_ID: "audience_123",
      DISPATCH_APP_URL: "https://dispatch.example.com",
    });

    sendEmailMock.mockResolvedValue({
      data: {
        id: "broadcast_prompt_1",
      },
      error: null,
    });
  });

  it("sends prompt broadcast with submission URL in html and text", async () => {
    const result = await sendCallForSubmissions({
      submissionUrl: "https://dispatch.example.com/submit",
    });

    expect(sendEmailMock).toHaveBeenCalledWith({
      from: "dispatch@example.com",
      subject: "Weekend Dispatch — your update",
      html: expect.stringContaining("https://dispatch.example.com/submit"),
      text: expect.stringContaining("https://dispatch.example.com/submit"),
      audienceId: "audience_123",
      send: true,
    });

    expect(result).toEqual({
      provider: "resend",
      audienceId: "audience_123",
      broadcastId: "broadcast_prompt_1",
    });
  });

  it("throws when Resend returns an error", async () => {
    sendEmailMock.mockResolvedValue({
      data: null,
      error: { message: "rate limited" },
    });

    await expect(
      sendCallForSubmissions({ submissionUrl: "https://dispatch.example.com" }),
    ).rejects.toThrow(/call-for-submissions broadcast/);
  });
});
