import { describe, expect, it } from "vitest";
import { normalizeMoneyText } from "../utils/normalizeMoneyText";

describe("normalizeMoneyText", () => {
  it.each([
    ["84.20", "84.20"],
    ["84.2", "84.2"],
    ["1200", "1200"],
    [".5", "0.5"],
    ["007.50", "7.50"],
    ["12,50", "12.50"],
    ["1,200", "1200"],
    ["1,200.00", "1200.00"],
    ["1,234,567.89", "1234567.89"],
    ["1.200,50", "1200.50"],
    ["$1,200", "1200"],
    ["$ 84.20", "84.20"],
    [" 84.20 ", "84.20"],
    ["1 200", "1200"],
  ])("reads %j on a \".\" keypad as %j", (text, expected) => {
    expect(normalizeMoneyText(text, ".")).toBe(expected);
  });

  it.each([
    ["84,20", "84.20"],
    ["84,2", "84.2"],
    [",5", "0.5"],
    ["84.20", "84.20"],
    ["1.200", "1200"],
    ["1.200,50", "1200.50"],
    ["1.234.567,89", "1234567.89"],
    ["1,200.00", "1200.00"],
    ["1 200,50", "1200.50"],
    ["1 200,50", "1200.50"],
    ["1 200,50", "1200.50"],
    ["$1.200", "1200"],
  ])("reads %j on a \",\" keypad as %j", (text, expected) => {
    expect(normalizeMoneyText(text, ",")).toBe(expected);
  });

  it("reads blank, or only a dollar sign, as blank", () => {
    expect(normalizeMoneyText("", ".")).toBe("");
    expect(normalizeMoneyText("   ", ",")).toBe("");
    expect(normalizeMoneyText("$", ".")).toBe("");
  });

  it.each([
    ["1.200", "."],
    ["84.205", "."],
    ["1,200", ","],
    ["84,205", ","],
  ])("won't guess whether %j on a %j keypad is thousands or a fraction of a cent", (text, separator) => {
    expect(normalizeMoneyText(text, separator as "." | ",")).toBeUndefined();
  });

  it.each(["50abc", "abc", "-5", "1e3", "12.", "12,", ".", ",", "0,500", "1,2,3", "12 50", "1,20,0", "1.200,5,0", "1,234.567", "84.20$", "€84", "1, 200", "1,2345"])(
    "refuses %j",
    (text) => {
      expect(normalizeMoneyText(text, ".")).toBeUndefined();
      expect(normalizeMoneyText(text, ",")).toBeUndefined();
    },
  );
});
