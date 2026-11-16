import { describe, expect, it } from "vitest";
import { isNegativeMoneyText, moneyTextToCents } from "../utils/moneyTextToCents";

describe("moneyTextToCents", () => {
  it.each([
    ["1250,50", ",", 125_050],
    ["1.250,50", ",", 125_050],
    ["1250.50", ".", 125_050],
    ["$1,250.50", ".", 125_050],
    ["$1,250", ".", 125_000],
    ["0", ".", 0],
    ["0,10", ",", 10],
  ] as const)("reads %s on a %s keypad as %s cents", (text, separator, cents) => {
    expect(moneyTextToCents(text, separator)).toBe(cents);
  });

  it("is null for blank, never zero", () => {
    expect(moneyTextToCents("", ".")).toBeNull();
    expect(moneyTextToCents("  ", ",")).toBeNull();
  });

  it.each([["1,234", ","], ["abc", "."], ["-5", "."], ["1.005", "."], ["1e3", "."]] as const)("is undefined for %s on %s", (text, separator) => {
    expect(moneyTextToCents(text, separator)).toBeUndefined();
  });
});

describe("isNegativeMoneyText", () => {
  it.each([["-5", "."], ["-5,50", ","], ["- 1.250,50", ","], ["-$5", "."]] as const)("is true for %s", (text, separator) => {
    expect(isNegativeMoneyText(text, separator)).toBe(true);
  });

  it.each([["5", "."], ["-", "."], ["-0", "."], ["-abc", "."], ["", "."]] as const)("is false for %s", (text, separator) => {
    expect(isNegativeMoneyText(text, separator)).toBe(false);
  });
});
