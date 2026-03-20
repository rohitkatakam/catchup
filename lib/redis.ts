import "server-only";

import { Redis } from "@upstash/redis";

import { getEnv } from "@/lib/env";

export type RedisClient = Pick<Redis, "rpush" | "lrange" | "ltrim" | "set" | "del">;

let cachedRedisClient: RedisClient | null = null;

export function getRedisClient(): RedisClient {
  if (cachedRedisClient) {
    return cachedRedisClient;
  }

  const env = getEnv();

  cachedRedisClient = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });

  return cachedRedisClient;
}
