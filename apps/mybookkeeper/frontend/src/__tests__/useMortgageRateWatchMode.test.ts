import { describe, it, expect } from "vitest";
import { useMortgageRateWatchMode } from "@/app/features/mortgages/useMortgageRateWatchMode";

// ─────────────────────────────────────────────────────────────────────────────
// useMortgageRateWatchMode
// ─────────────────────────────────────────────────────────────────────────────

describe("useMortgageRateWatchMode", () => {
  it("returns 'idle' before the operator has asked for a check", () => {
    // The check reaches an external service, so an unchecked section must not
    // render as loading — nothing is in flight.
    expect(
      useMortgageRateWatchMode({
        hasChecked: false,
        isFetching: false,
        isError: false,
        outlookCount: 0,
      }),
    ).toBe("idle");
  });

  it("returns 'loading' while fetching, even on the first check", () => {
    expect(
      useMortgageRateWatchMode({
        hasChecked: false,
        isFetching: true,
        isError: false,
        outlookCount: 0,
      }),
    ).toBe("loading");
    expect(
      useMortgageRateWatchMode({
        hasChecked: true,
        isFetching: true,
        isError: false,
        outlookCount: 2,
      }),
    ).toBe("loading");
  });

  it("returns 'error' when a completed check failed", () => {
    expect(
      useMortgageRateWatchMode({
        hasChecked: true,
        isFetching: false,
        isError: true,
        outlookCount: 0,
      }),
    ).toBe("error");
  });

  it("returns 'empty' when the check ran and there were no loans to compare", () => {
    expect(
      useMortgageRateWatchMode({
        hasChecked: true,
        isFetching: false,
        isError: false,
        outlookCount: 0,
      }),
    ).toBe("empty");
  });

  it("returns 'results' once a successful check produced outlooks", () => {
    expect(
      useMortgageRateWatchMode({
        hasChecked: true,
        isFetching: false,
        isError: false,
        outlookCount: 2,
      }),
    ).toBe("results");
  });
});
