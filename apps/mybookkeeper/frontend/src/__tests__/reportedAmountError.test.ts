import { describe, expect, it } from "vitest";
import { reportedAmountError } from "@/shared/utils/reported-amount-error";

describe("reportedAmountError", () => {
  it.each(["0", "0.00", "84.2", ".5", "1234.56", "9999999999.99", " 12 "])("accepts %j", (value) => {
    expect(reportedAmountError(value)).toBeUndefined();
  });

  it.each([
    ["", "Enter the amount reported on the 1099."],
    ["  ", "Enter the amount reported on the 1099."],
    ["-5", "Enter an amount of $0 or more."],
    ["-0.01", "Enter an amount of $0 or more."],
    ["12.345", "Use dollars and cents, like 84.20."],
    ["1e3", "Use dollars and cents, like 84.20."],
    ["10000000000", "That amount is too large."],
  ])("refuses %j", (value, message) => {
    expect(reportedAmountError(value)).toBe(message);
  });
});
