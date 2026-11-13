import { afterEach, describe, expect, it } from "vitest";
import { announceCaughtError, announceUnlessReloading } from "../lib/caught-error";
import { __resetStaleChunkStateForTests, reloadOnceForStaleChunk } from "../lib/stale-chunk";
import { CAUGHT_ERROR_EVENT } from "../constants/caught-error-event";
import type { CaughtErrorDetail } from "../types/caught-error-detail";

const announced: CaughtErrorDetail[] = [];
function record(event: Event): void {
  if (event instanceof CustomEvent) announced.push(event.detail as CaughtErrorDetail);
}

afterEach(() => {
  window.removeEventListener(CAUGHT_ERROR_EVENT, record);
  __resetStaleChunkStateForTests();
  announced.length = 0;
});

describe("announceCaughtError", () => {
  it("dispatches the boundary and the error's name, message and stack", () => {
    window.addEventListener(CAUGHT_ERROR_EVENT, record);
    const error = new TypeError("Cannot convert undefined or null to object");

    announceCaughtError("PageErrorBoundary", error);

    expect(announced).toEqual([
      {
        source: "PageErrorBoundary",
        name: "TypeError",
        message: "Cannot convert undefined or null to object",
        stack: error.stack ?? "",
      },
    ]);
  });

  it("describes a thrown non-Error too", () => {
    window.addEventListener(CAUGHT_ERROR_EVENT, record);

    announceCaughtError("RouteErrorFallback", "plain string");

    expect(announced).toEqual([{ source: "RouteErrorFallback", name: "NonError", message: "plain string", stack: "" }]);
  });

  it("describes a thrown route Response by its status, not as [object Object]", () => {
    window.addEventListener(CAUGHT_ERROR_EVENT, record);

    announceCaughtError("RouteErrorFallback", { status: 404, statusText: "Not Found", internal: true, data: "" });

    expect(announced).toEqual([
      { source: "RouteErrorFallback", name: "RouteErrorResponse", message: "404 Not Found", stack: "" },
    ]);
  });
});

describe("announceUnlessReloading", () => {
  const chunkError = new TypeError("Failed to fetch dynamically imported module: /assets/a-1234abcd.js");

  function scheduleReload(): void {
    const store = new Map<string, string>();
    const scheduled = reloadOnceForStaleChunk({
      storage: { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => void store.set(key, value) },
      pathname: "/x",
      now: Date.now(),
      reload: () => {},
    });
    expect(scheduled).toBe(true);
  }

  it("announces any error that isn't a stale chunk", () => {
    window.addEventListener(CAUGHT_ERROR_EVENT, record);
    scheduleReload();

    announceUnlessReloading("ErrorBoundary", new Error("boom"));

    expect(announced).toEqual([expect.objectContaining({ source: "ErrorBoundary", message: "boom" })]);
  });

  it("announces a stale chunk when no reload is scheduled", () => {
    window.addEventListener(CAUGHT_ERROR_EVENT, record);

    announceUnlessReloading("PageErrorBoundary", chunkError);

    expect(announced).toEqual([expect.objectContaining({ source: "PageErrorBoundary", message: chunkError.message })]);
  });

  it("stays quiet for a stale chunk the page is reloading away from", () => {
    window.addEventListener(CAUGHT_ERROR_EVENT, record);
    scheduleReload();

    announceUnlessReloading("RouteErrorFallback", chunkError);

    expect(announced).toEqual([]);
  });
});
