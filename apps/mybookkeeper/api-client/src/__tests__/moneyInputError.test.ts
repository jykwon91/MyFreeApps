import { describe, expect, it } from "vitest";
import { moneyInputError } from "../utils/moneyInputError";

describe("moneyInputError", () => {
  it.each(["0.01", "84.2", "84.20", "12", " 12.50 ", "9999999999.99"])("accepts %j", (value) => {
    expect(moneyInputError(value)).toBeUndefined();
  });

  it.each(["", "   ", "0", "0.00"])("asks for an amount above $0 for %j", (value) => {
    expect(moneyInputError(value)).toBe("Enter an amount above $0.");
  });

  it.each(["-5", "12.345", "1e3", "12.", "$12", "abc"])("asks for dollars and cents for %j", (value) => {
    expect(moneyInputError(value)).toBe("Use dollars and cents, like 84.20.");
  });
});
