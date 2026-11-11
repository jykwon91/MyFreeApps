/** A link's scheme, as in `https:`. Matches `safeLinkUrl`'s reading. */
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

/** A profile link, trimmed, with `https://` added when it was pasted without a scheme (`linkedin.com/in/…`, `www.…`). Blank stays blank. */
export function normalizeProfileUrl(value: string): string {
  const url = value.trim();
  if (url === "" || SCHEME_PATTERN.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}
