import { describe, expect, it } from "vitest";
import { axisMoney } from "../utils/axisMoney";

describe("axisMoney", () => {
  it("shows whole dollars below a thousand", () => {
    expect([axisMoney(0), axisMoney(750), axisMoney(950)]).toEqual(["$0", "$750", "$950"]);
  });

  it("labels each gridline exactly, never rounding it to another value", () => {
    expect([axisMoney(1000), axisMoney(1250), axisMoney(2500), axisMoney(12_000)]).toEqual(["$1k", "$1.25k", "$2.5k", "$12k"]);
  });

  it("uses M for millions and keeps the sign on negatives", () => {
    expect([axisMoney(1_000_000), axisMoney(1_250_000), axisMoney(-2500)]).toEqual(["$1M", "$1.25M", "-$2.5k"]);
  });
});
