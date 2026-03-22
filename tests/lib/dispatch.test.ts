import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Submission, WeekId } from "@/lib/types";

vi.mock("server-only", () => ({}));

const { getEnvMock, createGatewayMock, generateTextMock, languageModelMock } = vi.hoisted(() => {
  const languageModel = vi.fn(() => ({}));
  const createGateway = vi.fn(() => ({
    languageModel,
  }));
  const generateText = vi.fn();

  return {
    getEnvMock: vi.fn(),
    createGatewayMock: createGateway,
    generateTextMock: generateText,
    languageModelMock: languageModel,
  };
});

vi.mock("@/lib/env", () => ({
  getEnv: getEnvMock,
}));

vi.mock("ai", () => ({
  createGateway: createGatewayMock,
  generateText: generateTextMock,
}));

import { generateDispatchContent } from "@/lib/dispatch";

const weekId = "2026-03-16" as WeekId;

const submissions: Submission[] = [
  {
    author: "Rohit",
    content: "Shipped the cron job.",
    timestamp: "2026-03-18T12:00:00.000Z",
  },
  {
    author: "Nina",
    content: "Finished the design review.",
    timestamp: "2026-03-19T08:00:00.000Z",
  },
];

describe("generateDispatchContent", () => {
  beforeEach(() => {
    getEnvMock.mockReset();
    generateTextMock.mockReset();
    languageModelMock.mockClear();
    createGatewayMock.mockClear();

    getEnvMock.mockReturnValue({
      AI_GATEWAY_API_KEY: "gw_test_key",
      DISPATCH_MODEL: "openai/gpt-4o-mini",
    });
  });

  it("returns parsed JSON from the model when output is valid", async () => {
    generateTextMock.mockResolvedValue({
      text: JSON.stringify({
        subject: "Sunday letter",
        preview: "Two voices this week",
        markdown: "## Highlights\n\nAll good.",
      }),
    });

    const result = await generateDispatchContent({ weekId, submissions });

    expect(result).toEqual({
      subject: "Sunday letter",
      preview: "Two voices this week",
      markdown: "## Highlights\n\nAll good.",
    });
    expect(createGatewayMock).toHaveBeenCalledWith({ apiKey: "gw_test_key" });
    expect(languageModelMock).toHaveBeenCalledWith("openai/gpt-4o-mini");
  });

  it("parses JSON wrapped in a fenced code block", async () => {
    generateTextMock.mockResolvedValue({
      text: '```json\n{"subject":"A","preview":"B","markdown":"C"}\n```',
    });

    const result = await generateDispatchContent({ weekId, submissions });

    expect(result).toEqual({
      subject: "A",
      preview: "B",
      markdown: "C",
    });
  });

  it("falls back to a template when model output is not valid JSON", async () => {
    generateTextMock.mockResolvedValue({
      text: "Sorry, I cannot comply.",
    });

    const result = await generateDispatchContent({ weekId, submissions });

    expect(result.subject).toBe(`Weekend Dispatch - ${weekId}`);
    expect(result.preview).toContain("2 updates");
    expect(result.markdown).toContain("Rohit");
    expect(result.markdown).toContain("Nina");
  });

  it("falls back to a template when generateText throws", async () => {
    generateTextMock.mockRejectedValue(new Error("gateway unavailable"));

    const result = await generateDispatchContent({ weekId, submissions });

    expect(result.subject).toBe(`Weekend Dispatch - ${weekId}`);
    expect(result.preview).toContain("2 updates");
  });
});
