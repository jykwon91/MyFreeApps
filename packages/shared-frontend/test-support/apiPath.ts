/**
 * Matches requests by their path under the API base, ignoring the query
 * string. For E2E tests only.
 *
 * Compare paths, not a glob: `**${apiBase}/**` also matches the dev server's
 * own modules in any folder named like the base (MyGamingAssistant's
 * src/games/wow-forever/api/).
 */
import type { Request } from "@playwright/test";
import { DEFAULT_API_BASE } from "./constants/defaultApiBase";

/** The URL's path with the API base cut off, or null when it isn't under the base. */
export function pathUnderBase(url: URL, apiBase: string = DEFAULT_API_BASE): string | null {
  return url.pathname.startsWith(`${apiBase}/`) ? url.pathname.slice(apiBase.length) : null;
}

/** A page.route() matcher for the paths under the API base that `pattern` accepts. */
export function apiPath(pattern: RegExp, apiBase: string = DEFAULT_API_BASE): (url: URL) => boolean {
  return (url) => {
    const path = pathUnderBase(url, apiBase);
    return path !== null && pattern.test(path);
  };
}

/** `pattern`'s first capture group in the request's path (a record id), or "" when it doesn't match. */
export function pathId(pattern: RegExp, request: Request, apiBase: string = DEFAULT_API_BASE): string {
  return pattern.exec(pathUnderBase(new URL(request.url()), apiBase) ?? "")?.[1] ?? "";
}
