import { isRouteErrorResponse } from "react-router-dom";
import { CAUGHT_ERROR_EVENT } from "../constants/caught-error-event";
import type { CaughtErrorDetail } from "../types/caught-error-detail";
import { isChunkLoadError, isStaleChunkReloadScheduled } from "./stale-chunk";
import { describeRouteError } from "../utils/describeRouteError";

function detailOf(source: string, error: unknown): CaughtErrorDetail {
  if (error instanceof Error) {
    return { source, name: error.name, message: error.message, stack: error.stack ?? "" };
  }
  if (isRouteErrorResponse(error)) {
    return { source, name: "RouteErrorResponse", message: describeRouteError(error), stack: "" };
  }
  return { source, name: "NonError", message: String(error), stack: "" };
}

/**
 * Announces on `window` that an error boundary caught a crash. Every boundary
 * (an app's own class boundaries and the shared RouteErrorFallback) calls this
 * from componentDidCatch or its effect, so anything listening — the mocked
 * Playwright suites' crash guard — sees caught crashes as reliably as uncaught
 * ones, without matching log text.
 */
export function announceCaughtError(source: string, error: unknown): void {
  window.dispatchEvent(
    new CustomEvent<CaughtErrorDetail>(CAUGHT_ERROR_EVENT, { detail: detailOf(source, error) }),
  );
}

/**
 * announceCaughtError, except for a stale chunk the page is already reloading
 * away from: that is the deploy-recovery path, not a crash. A chunk error the
 * once-per-path reload guard declined (or that nothing reloaded for) is
 * announced, because the page is now stuck on the new-version prompt. A
 * boundary that tries the reload itself must try it before calling this.
 */
export function announceUnlessReloading(source: string, error: unknown): void {
  if (isChunkLoadError(error) && isStaleChunkReloadScheduled()) return;
  announceCaughtError(source, error);
}
