import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseEnv } from "@/lib/env";

const completeEnv = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
  RESEND_API_KEY: "re_test_key",
  DISPATCH_FROM_EMAIL: "dispatch@example.com",
  DISPATCH_AUDIENCE_ID: "audience_123",
  DISPATCH_APP_URL: "https://dispatch.example.com",
  AI_GATEWAY_API_KEY: "gw_test_key",
  DISPATCH_MODEL: "openai/gpt-4o-mini",
  RESPAN_API_KEY: "respan-test-key",
  RESPAN_PROJECT_ID: "proj_test",
  CRON_SECRET: "super-secret",
} satisfies Record<string, string | undefined>;

describe("parseEnv", () => {
  it("throws when required variables are missing", () => {
    expect(() => parseEnv({})).toThrowError(/Missing or invalid environment variables/i);
    expect(() => parseEnv({})).toThrowError(/UPSTASH_REDIS_REST_URL/i);
  });

  it("throws when required variables are whitespace-only", () => {
    const withWhitespaceOnly = {
      ...completeEnv,
      CRON_SECRET: "   ",
    };

    expect(() => parseEnv(withWhitespaceOnly)).toThrowError(
      /Missing or invalid environment variables/i,
    );
    expect(() => parseEnv(withWhitespaceOnly)).toThrowError(/CRON_SECRET/i);
  });

  it("throws when URL-like variables are invalid", () => {
    const withInvalidUrl = {
      ...completeEnv,
      UPSTASH_REDIS_REST_URL: "not-a-url",
    };

    expect(() => parseEnv(withInvalidUrl)).toThrowError(
      /Missing or invalid environment variables/i,
    );
    expect(() => parseEnv(withInvalidUrl)).toThrowError(/UPSTASH_REDIS_REST_URL/i);
  });

  it("throws when DISPATCH_AUDIENCE_ID is missing or empty", () => {
    const withoutAudienceId = {
      ...completeEnv,
      DISPATCH_AUDIENCE_ID: "   ",
    };

    expect(() => parseEnv(withoutAudienceId)).toThrowError(
      /Missing or invalid environment variables/i,
    );
    expect(() => parseEnv(withoutAudienceId)).toThrowError(/DISPATCH_AUDIENCE_ID/i);
  });

  it("throws when DISPATCH_FROM_EMAIL is present but invalid", () => {
    const withInvalidFromEmail = {
      ...completeEnv,
      DISPATCH_FROM_EMAIL: "not-an-email",
    };

    expect(() => parseEnv(withInvalidFromEmail)).toThrowError(
      /Missing or invalid environment variables/i,
    );
    expect(() => parseEnv(withInvalidFromEmail)).toThrowError(/DISPATCH_FROM_EMAIL/i);
  });

  it("passes when all required variables are present", () => {
    const parsed = parseEnv(completeEnv);

    expect(parsed.UPSTASH_REDIS_REST_URL).toBe(completeEnv.UPSTASH_REDIS_REST_URL);
    expect(parsed.CRON_SECRET).toBe(completeEnv.CRON_SECRET);
  });
});
