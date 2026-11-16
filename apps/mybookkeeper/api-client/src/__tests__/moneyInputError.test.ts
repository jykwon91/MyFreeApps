import { describe, expect, it } from "vitest";
import { moneyInputError } from "../utils/moneyInputError";

describe("moneyInputError", () => {
  it.each(["0.01", "84.2", "84.20", "12", " 12.50 ", "9999999999.99", ".5", ".50", "$12", "1,200.50"])("accepts %j on a \".\" keypad", (value) => {
    expect(moneyInputError(value, ".")).toBeUndefined();
  });

  it.each(["84,20", "12,5", "1.200,50", "84.20", "$ 1 200,00"])("accepts %j on a \",\" keypad", (value) => {
    expect(moneyInputError(value, ",")).toBeUndefined();
  });

  it.each(["", "   ", "0", "0.00", "$"])("asks for an amount above $0 for %j", (value) => {
    expect(moneyInputError(value, ".")).toBe("Enter an amount above $0.");
  });

  it.each(["-5", "12.345", "1e3", "12.", "abc", ".", ".505", "50abc", "1.200"])("asks for dollars and cents for %j", (value) => {
    expect(moneyInputError(value, ".")).toBe("Use dollars and cents, like 84.20.");
  });

  it("shows the comma form of the example on a \",\" keypad", () => {
    expect(moneyInputError("1,200", ",")).toBe("Use dollars and cents, like 84,20.");
    expect(moneyInputError("0,00", ",")).toBe("Enter an amount above $0.");
  });
});
