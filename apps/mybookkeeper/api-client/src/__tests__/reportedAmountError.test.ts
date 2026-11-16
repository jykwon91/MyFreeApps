import { describe, expect, it } from "vitest";
import { reportedAmountError } from "../utils/reportedAmountError";

describe("reportedAmountError", () => {
  it.each([
    ["0", "."],
    ["0.00", "."],
    ["84.2", "."],
    [".5", "."],
    ["1234.56", "."],
    ["1,000", "."],
    ["9999999999.99", "."],
    [" 12 ", "."],
    ["0", ","],
    ["84,20", ","],
    ["1.234,56", ","],
  ] as const)("accepts %j on a %j keypad", (value, separator) => {
    expect(reportedAmountError(value, separator)).toBeUndefined();
  });

  it.each([
    ["", ".", "Enter the amount reported on the 1099."],
    ["  ", ".", "Enter the amount reported on the 1099."],
    ["-5", ".", "Enter an amount of $0 or more."],
    ["-0.01", ".", "Enter an amount of $0 or more."],
    ["-84,20", ",", "Enter an amount of $0 or more."],
    ["12.345", ".", "Use dollars and cents, like 84.20."],
    ["1e3", ".", "Use dollars and cents, like 84.20."],
    ["1,000", ",", "Use dollars and cents, like 84,20."],
    ["10000000000", ".", "That amount is too large."],
    ["10.000.000.000", ",", "That amount is too large."],
  ] as const)("refuses %j on a %j keypad", (value, separator, message) => {
    expect(reportedAmountError(value, separator)).toBe(message);
  });
});
