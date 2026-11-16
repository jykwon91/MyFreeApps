import { describe, expect, it } from "vitest";
import { wholeCountError } from "@/shared/utils/whole-count";

const ERRORS = { required: "req", notWhole: "whole", tooLow: "low", tooHigh: "high" };
const check = (text: string) => wholeCountError(text, 0, 10, ERRORS);

describe("wholeCountError", () => {
  it.each(["0", "1", "10", " 5 ", "+3"])("accepts %j", (text) => {
    expect(check(text)).toBeUndefined();
  });

  it.each(["", "   "])("requires a value for %j", (text) => {
    expect(check(text)).toBe("req");
  });

  it.each(["2.5", "1.0", "1e1", "abc", "1,5", "0x5", "."])("rejects non-whole %j", (text) => {
    expect(check(text)).toBe("whole");
  });

  it("rejects below the minimum", () => {
    expect(check("-1")).toBe("low");
    expect(wholeCountError("0", 1, 10, ERRORS)).toBe("low");
  });

  it("rejects above the maximum", () => {
    expect(check("11")).toBe("high");
  });
});
