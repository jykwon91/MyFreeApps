import { describe, expect, it } from "vitest";
import { progressPercent } from "../utils/progressPercent";

describe("progressPercent", () => {
  it("is the share of the total that is done", () => {
    expect(progressPercent(1, 4)).toBe(25);
    expect(progressPercent(4, 4)).toBe(100);
  });

  it("is 0 when the total is not known yet", () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(3, 0)).toBe(0);
  });
});
