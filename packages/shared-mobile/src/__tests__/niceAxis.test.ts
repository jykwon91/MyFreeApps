import { niceAxis } from "../utils/niceAxis";

describe("niceAxis", () => {
  it("rounds a $2,500 top up to whole-thousand gridlines", () => {
    expect(niceAxis(2500, 3)).toEqual({ stepValue: 1000, maxValue: 3000 });
  });

  it("uses a 2.5 step when it fits tighter", () => {
    expect(niceAxis(2500, 4)).toEqual({ stepValue: 1000, maxValue: 4000 });
    expect(niceAxis(7400, 3)).toEqual({ stepValue: 2500, maxValue: 7500 });
  });

  it("keeps the top at or above the data, exactly on it when it fits", () => {
    expect(niceAxis(3000, 3)).toEqual({ stepValue: 1000, maxValue: 3000 });
    expect(niceAxis(12_345, 3)).toEqual({ stepValue: 5000, maxValue: 15_000 });
  });

  it("gives an empty chart a small axis starting at zero", () => {
    expect(niceAxis(0, 3)).toEqual({ stepValue: 1, maxValue: 3 });
    expect(niceAxis(-5, 3)).toEqual({ stepValue: 1, maxValue: 3 });
  });

  it("handles small and fractional values", () => {
    expect(niceAxis(7, 3)).toEqual({ stepValue: 2.5, maxValue: 7.5 });
    expect(niceAxis(0.8, 3)).toEqual({ stepValue: 0.5, maxValue: 1.5 });
  });

  it("always lands the top on a whole number of steps", () => {
    for (const max of [1, 9, 99, 101, 640, 999, 4321, 1_250_000, 0.03]) {
      const { stepValue, maxValue } = niceAxis(max, 3);
      expect(maxValue).toBeGreaterThanOrEqual(max);
      expect(maxValue).toBeCloseTo(stepValue * 3, 9);
    }
  });
});
