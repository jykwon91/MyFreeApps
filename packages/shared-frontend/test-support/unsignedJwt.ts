/**
 * A JWT-shaped token the web auth guard accepts: its payload decodes and its
 * `exp` is in the future. Unsigned, so only a stubbed backend takes it. For
 * E2E tests only -- what a stubbed login endpoint hands back as access_token.
 *
 * `issuedAtMs` is now unless given; a spec that pins the page's clock passes
 * that instant, so the token is unexpired by the page's clock.
 */
const DEFAULT_TTL_SECONDS = 3600;

function base64Url(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function unsignedJwt(subject = "test-user", ttlSeconds = DEFAULT_TTL_SECONDS, issuedAtMs = Date.now()): string {
  const exp = Math.floor(issuedAtMs / 1000) + ttlSeconds;
  return `${base64Url({ alg: "HS256", typ: "JWT" })}.${base64Url({ sub: subject, exp })}.fake-signature`;
}
