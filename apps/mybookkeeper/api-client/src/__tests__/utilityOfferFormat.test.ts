import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCancellationFee, formatCancellationFeeShort, formatWholeDollars } from "../utils/utilityOfferFormat";

/** A phone set to German: any number formatted with no explicit locale uses "." for thousands. */
function useGermanDefaultLocale(): void {
  const real = Number.prototype.toLocaleString;
  vi.spyOn(Number.prototype, "toLocaleString").mockImplementation(function (this: number, locales, options) {
    return real.call(this, locales ?? "de-DE", options);
  });
}

describe("utility offer money on a German-locale device", () => {
  beforeEach(useGermanDefaultLocale);
  afterEach(() => vi.restoreAllMocks());

  it("prints whole dollars with a comma thousands separator, never $1.879", () => {
    expect(formatWholeDollars(187_900)).toBe("$1,879");
  });

  it("prints the exit fee the same way", () => {
    expect(formatCancellationFee(150_000, false)).toBe("$1,500 exit fee");
    expect(formatCancellationFee(150_000, true)).toBe("$1,500 per month left");
    expect(formatCancellationFeeShort(150_000, false)).toBe("$1,500");
  });
});

describe("utility offer money", () => {
  it("rounds to whole dollars and keeps the unpublished and none cases", () => {
    expect(formatWholeDollars(15_049)).toBe("$150");
    expect(formatCancellationFee(null, false)).toBe("Exit fee not published");
    expect(formatCancellationFee(0, false)).toBe("No exit fee");
  });
});
