/** Matches requests by their path under the API base, ignoring the query string. */
import type { Request } from "@playwright/test";
import { DEFAULT_API_BASE } from "@platform/ui/test-support/constants/defaultApiBase";

function underBase(url: URL): string | null {
  return url.pathname.startsWith(`${DEFAULT_API_BASE}/`) ? url.pathname.slice(DEFAULT_API_BASE.length) : null;
}

/** A page.route() matcher for the paths `pattern` accepts. */
export function apiPath(pattern: RegExp): (url: URL) => boolean {
  return (url) => {
    const path = underBase(url);
    return path !== null && pattern.test(path);
  };
}

/** `pattern`'s first capture group in the request's path (a record id), or "" when it doesn't match. */
export function pathId(pattern: RegExp, request: Request): string {
  return pattern.exec(underBase(new URL(request.url())) ?? "")?.[1] ?? "";
}
