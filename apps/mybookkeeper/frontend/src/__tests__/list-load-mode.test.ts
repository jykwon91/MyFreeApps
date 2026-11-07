import { describe, it, expect } from "vitest";
import { resolveListLoadMode } from "@/shared/lib/list-load-mode";

describe("resolveListLoadMode", () => {
  it("is 'loading' before the first answer", () => {
    expect(resolveListLoadMode({ hasData: false, hasError: false, itemCount: 0 })).toBe("loading");
  });

  // Also the state of a retry in flight: RTK clears isError and isLoading while
  // a failed query is retried, but keeps `error`, with no data yet.
  it("is 'error' (never 'empty') when the list never loaded and the load failed", () => {
    expect(resolveListLoadMode({ hasData: false, hasError: true, itemCount: 0 })).toBe("error");
  });

  it("is 'empty' when the list loaded with nothing in it", () => {
    expect(resolveListLoadMode({ hasData: true, hasError: false, itemCount: 0 })).toBe("empty");
  });

  it("is 'list' when the list loaded with items", () => {
    expect(resolveListLoadMode({ hasData: true, hasError: false, itemCount: 3 })).toBe("list");
  });

  it("keeps showing items that loaded before when a later load failed", () => {
    expect(resolveListLoadMode({ hasData: true, hasError: true, itemCount: 3 })).toBe("list");
  });

  // RTK keeps the previous args' data when a load for new args (another filter)
  // fails, so an empty earlier answer must not read as "nothing matches".
  it("never claims the list is empty while its latest load failed", () => {
    expect(resolveListLoadMode({ hasData: true, hasError: true, itemCount: 0 })).toBe("error");
  });
});
