/**
 * A JWT-shaped token the web auth guard accepts: its payload decodes and its
 * `exp` is in the future. Unsigned, so only a stubbed backend takes it. For
 * E2E tests only -- what a stubbed login endpoint hands back as access_token.
 */
const DEFAULT_TTL_SECONDS = 3600;

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function unsignedJwt(subject = "test-user", ttlSeconds = DEFAULT_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({ sub: subject, exp })}.fake-signature`;
}
