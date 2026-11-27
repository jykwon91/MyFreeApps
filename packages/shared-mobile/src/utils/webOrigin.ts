// The host has to end the URL or be followed by a path, query or fragment, so "https://a.org@b.org" (user "a.org"
// on b.org) or "https://a.org\b.org" isn't read as a.org.
const WEB_ORIGIN = /^https?:\/\/[^/?#\\@]+(?=$|[/?#])/i;

/**
 * "https://example.org" for any http(s) URL on that host, lower-cased; null for anything else, such as another
 * scheme or a URL with a user name in it. Not `URL.origin`: React Native's polyfill reads "https://a.org@b.org"
 * as a.org.
 */
export function webOrigin(url: string): string | null {
  return WEB_ORIGIN.exec(url)?.[0].toLowerCase() ?? null;
}
