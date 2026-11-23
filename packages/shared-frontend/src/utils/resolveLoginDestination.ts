import { safeReturnPath } from "./safeReturnPath";
import type { RequireAuthLocationState } from "../types/require-auth-location-state";

/**
 * Where the sign-in page sends the visitor once they're signed in: the page
 * RequireAuth sent them from (router state), else the `returnTo` query
 * parameter the sign-up page's sign-in link carries, else the app's home.
 * Both are visitor-controlled, so each goes through `safeReturnPath` and only
 * a path on this site is kept.
 */
export function resolveLoginDestination(
  locationState: unknown,
  returnTo: string | null,
  home: string,
): string {
  const from = (locationState as RequireAuthLocationState | null)?.from;
  return safeReturnPath(from) ?? safeReturnPath(returnTo) ?? home;
}
