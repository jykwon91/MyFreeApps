import { describe, expect, it } from "vitest";
import { NORMAL_RATE, SLOW_RATE } from "../constants/speechRates";
import { replayRate } from "../utils/replayRate";

describe("replayRate", () => {
  it("plays again at the normal pace, or slower", () => {
    expect(replayRate(false)).toBe(NORMAL_RATE);
    expect(replayRate(true)).toBe(SLOW_RATE);
    expect(SLOW_RATE).toBeLessThan(NORMAL_RATE);
  });
});
