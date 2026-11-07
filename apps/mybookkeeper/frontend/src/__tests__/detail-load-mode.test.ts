import { describe, it, expect } from "vitest";
import { resolveDetailLoadMode } from "@/shared/lib/detail-load-mode";

describe("resolveDetailLoadMode", () => {
  it("is 'loading' before the first answer", () => {
    expect(resolveDetailLoadMode({ hasData: false, hasError: false })).toBe("loading");
  });

  // Also the state of a retry in flight: RTK clears isError and isLoading while
  // a failed query is retried, but keeps `error`, with no data yet.
  it("is 'error' (never 'loading') when the record never loaded and the load failed", () => {
    expect(resolveDetailLoadMode({ hasData: false, hasError: true })).toBe("error");
  });

  it("is 'content' once the record loaded", () => {
    expect(resolveDetailLoadMode({ hasData: true, hasError: false })).toBe("content");
  });

  it("keeps the record showing when a refresh fails", () => {
    expect(resolveDetailLoadMode({ hasData: true, hasError: true })).toBe("content");
  });
});
