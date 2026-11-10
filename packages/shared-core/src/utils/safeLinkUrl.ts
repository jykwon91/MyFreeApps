/** A link's scheme, as in `https:` or `mailto:`. `URL` isn't used: React Native's doesn't implement `protocol`. */
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;

/**
 * The value, trimmed, when it's a link with one of the allowed schemes; otherwise null.
 * An allowlist, so `javascript:`, `data:`, `file:`, an app's own scheme or a bare word never opens.
 */
export function safeLinkUrl(value: string, allowedSchemes: readonly string[]): string | null {
  const url = value.trim();
  const scheme = SCHEME_PATTERN.exec(url)?.[1]?.toLowerCase();
  return scheme && allowedSchemes.includes(scheme) ? url : null;
}
