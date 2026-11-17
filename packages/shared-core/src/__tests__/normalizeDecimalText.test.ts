import { describe, expect, it } from "vitest";
import { normalizeDecimalText } from "../utils/normalizeDecimalText";

describe("normalizeDecimalText", () => {
  it.each([
    ["11.5", 4, "11.5"],
    ["7.125", 3, "7.125"],
    ["2.990", 3, "2.990"],
    ["2.500", 2, "2.50"],
    ["2.00", 2, "2.00"],
    ["100", 2, "100"],
    ["007.5", 2, "7.5"],
    ["0.001", 3, "0.001"],
    [".5", 2, "0.5"],
    ["5.", 2, "5"],
    [" 11.5 ", 4, "11.5"],
    [" 11.5 ", 4, "11.5"],
    ["5.3509", 4, "5.3509"],
  ])("reads %j on a \".\" keypad (max %i decimals) as %j", (text, maxDecimals, expected) => {
    expect(normalizeDecimalText(text, ".", { maxDecimals })).toBe(expected);
  });

  it.each([
    ["11,5", 4, "11.5"],
    ["7,125", 3, "7.125"],
    ["2,5", 2, "2.5"],
    ["2,500", 2, "2.50"],
    [",5", 2, "0.5"],
    ["11.5", 4, "11.5"],
    ["7.125", 3, "7.125"],
    ["1.000", 4, "1.000"],
  ])("reads %j on a \",\" keypad (max %i decimals) as %j", (text, maxDecimals, expected) => {
    expect(normalizeDecimalText(text, ",", { maxDecimals })).toBe(expected);
  });

  it.each(["", "   "])("reads blank %j as \"\"", (text) => {
    expect(normalizeDecimalText(text, ",", { maxDecimals: 2 })).toBe("");
  });

  it.each([
    ["11,5", "."],
    ["1,250", "."],
    ["1.250,5", ","],
    ["1,250.5", "."],
    ["1.2.3", "."],
    ["1,2,3", ","],
    ["-2.5", "."],
    ["+2.5", "."],
    ["-2,5", ","],
    ["1e3", "."],
    ["0x1A", "."],
    ["Infinity", "."],
    ["abc", ","],
    [".", "."],
    [",", ","],
    ["1 000", "."],
    ["2.5%", "."],
    ["$2.50", "."],
  ] as const)("refuses %j on a %j keypad", (text, separator) => {
    expect(normalizeDecimalText(text, separator, { maxDecimals: 4 })).toBeUndefined();
  });

  it.each([
    ["2.555", ".", 2],
    ["2,555", ",", 2],
    ["7.1255", ".", 3],
    ["5.35091", ".", 4],
    ["0.001", ".", 2],
  ] as const)("refuses %j on a %j keypad for having more than %i decimals", (text, separator, maxDecimals) => {
    expect(normalizeDecimalText(text, separator, { maxDecimals })).toBeUndefined();
  });

  it("reads any number of decimals when no limit is given", () => {
    expect(normalizeDecimalText("2,55512", ",")).toBe("2.55512");
  });

  it.each([
    ["1,234,567", "."],
    ["1.234.567", ","],
    ["1.234,5", ","],
    ["1 234,5", ","],
  ] as const)("never reads thousands grouping: refuses %j on a %j keypad", (text, separator) => {
    expect(normalizeDecimalText(text, separator)).toBeUndefined();
  });

  describe("keypadMarkOnly", () => {
    it.each([
      ["3,8", ",", 3.8],
      ["1,25", ",", 1.25],
      ["3.8", ".", 3.8],
      ["007,50", ",", 7.5],
      ["5,", ",", 5],
    ] as const)("reads %j on a %j keypad", (text, separator, expected) => {
      expect(Number(normalizeDecimalText(text, separator, { keypadMarkOnly: true }))).toBe(expected);
    });

    it.each([
      ["1.5", ","],
      ["1.500", ","],
      ["1,5", "."],
    ] as const)("refuses %j on a %j keypad, where that mark isn't the decimal one", (text, separator) => {
      expect(normalizeDecimalText(text, separator, { keypadMarkOnly: true })).toBeUndefined();
    });
  });
});
