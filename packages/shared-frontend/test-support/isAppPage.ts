/**
 * Whether a page at `url` shows the app under test: an http(s) document on the
 * suite's baseURL origin (any http(s) page when there is no baseURL). about:blank,
 * data: URLs and other sites are not app pages.
 */
export function isAppPage(url: string, baseURL: string | undefined): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  return baseURL === undefined || parsed.origin === new URL(baseURL).origin;
}
