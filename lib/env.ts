import "server-only";
import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);

const envSchema = z.object({
  UPSTASH_REDIS_REST_URL: nonEmptyString.url(),
  UPSTASH_REDIS_REST_TOKEN: nonEmptyString,
  RESEND_API_KEY: nonEmptyString,
  DISPATCH_FROM_EMAIL: nonEmptyString.email(),
  DISPATCH_AUDIENCE_ID: nonEmptyString,
  DISPATCH_APP_URL: nonEmptyString.url(),
  AI_GATEWAY_API_KEY: nonEmptyString,
  DISPATCH_MODEL: nonEmptyString,
  RESPAN_API_KEY: nonEmptyString,
  RESPAN_PROJECT_ID: nonEmptyString,
  CRON_SECRET: nonEmptyString,
});

export type Env = z.infer<typeof envSchema>;

function formatEnvError(error: z.ZodError): string {
  const variableNames = Array.from(
    new Set(error.issues.map((issue) => issue.path.join(".")).filter(Boolean)),
  );

  return `Missing or invalid environment variables: ${variableNames.join(", ")}`;
}

export function parseEnv(input: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    throw new Error(formatEnvError(result.error));
  }

  return result.data;
}

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  cachedEnv = parseEnv(process.env);
  return cachedEnv;
}
