export function getBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.trim().split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function isCronRequestAuthorized(request: Request, cronSecret: string): boolean {
  const authorizationToken = getBearerToken(request.headers.get("authorization"));

  if (authorizationToken && authorizationToken === cronSecret) {
    return true;
  }

  const headerSecret = request.headers.get("x-cron-secret");
  return Boolean(headerSecret && headerSecret === cronSecret);
}

export function getTriggerMode(request: Request): "manual" | "scheduled" {
  try {
    const trigger = new URL(request.url).searchParams.get("trigger");
    return trigger === "manual" ? "manual" : "scheduled";
  } catch {
    return "scheduled";
  }
}
