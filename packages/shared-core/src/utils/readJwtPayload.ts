import { base64UrlToBase64 } from "./base64UrlToBase64";
import { isRecord } from "./isRecord";

// Not part of the ES library, and this package has no DOM lib. Browsers provide it;
// a React Native host needs an engine that does too.
declare function atob(data: string): string;

/** A JWT's claims, unverified: `null` when the token isn't a JWT. */
export function readJwtPayload(token: string): Record<string, unknown> | null {
  const segment = token.split(".")[1];
  if (segment === undefined) return null;
  try {
    const payload: unknown = JSON.parse(atob(base64UrlToBase64(segment)));
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}
