import { describe, expect, it } from "vitest";
import { formatAccountBalance, formatAccountDate } from "../utils/financialAccountFormat";

describe("financial account formatting", () => {
  it("shows cents, the sign and the account's currency", () => {
    expect(formatAccountBalance(123456, "USD")).toBe("$1,234.56");
    expect(formatAccountBalance(-2500, "USD")).toBe("-$25.00");
    expect(formatAccountBalance(10000, "EUR")).toBe("€100.00");
  });

  it("reads a date-only value without shifting it", () => {
    expect(formatAccountDate("2026-11-01")).toBe("Nov 1, 2026");
  });
});
