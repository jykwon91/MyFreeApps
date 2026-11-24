import { describe, expect, it } from "vitest";
import type { Holding } from "../types/investments/holding";
import { decimalText } from "../utils/decimalText";
import {
  emptyHoldingForm,
  holdingFormProblems,
  holdingToFormValues,
  toHoldingCreateRequest,
  toHoldingUpdateRequest,
  trimDecimal,
} from "../utils/holdingForm";
import { formatGainLossPercent, formatPrice, formatQuantity, gainLossDirection } from "../utils/holdingFormat";

const filled = { ...emptyHoldingForm("a1"), ticker: " vti ", quantity: "10.5", price: "250.1234" };

function holding(overrides: Partial<Holding> = {}): Holding {
  return {
    id: "h1", financial_account_id: "a1", account_name: "Brokerage", is_manual: true, security_id: "s1",
    ticker_symbol: "VTI", name: "Vanguard", security_type: "etf", quantity: "10.5000000000",
    price: "250.12340000", price_as_of: "2026-11-24", is_price_stale: false, value_cents: 262_630,
    cost_basis_cents: 200_000, gain_loss_cents: 62_630, gain_loss_percent: 31.3, currency: "USD",
    ...overrides,
  };
}

describe("decimalText", () => {
  it("reads share counts and prices with any number of decimals", () => {
    expect(decimalText("0.123456", ".")).toBe("0.123456");
    expect(decimalText("1,234.5", ".")).toBe("1234.5");
    expect(decimalText("1.234,5", ",")).toBe("1234.5");
    expect(decimalText("$12", ".")).toBe("12");
    expect(decimalText(".5", ".")).toBe("0.5");
    expect(decimalText("", ".")).toBe("");
  });

  it("refuses what it can't be sure of", () => {
    expect(decimalText("-1", ".")).toBeUndefined();
    expect(decimalText("1.2.3", ".")).toBeUndefined();
    expect(decimalText("12,34", ".")).toBeUndefined();
    expect(decimalText("abc", ".")).toBeUndefined();
  });
});

describe("holdingFormProblems", () => {
  it("needs a ticker or a name, a share count and a price", () => {
    expect(holdingFormProblems(emptyHoldingForm("a1"), ".")).toEqual({
      ticker: "ticker_or_name", quantity: "required", price: "required",
    });
  });

  it("passes a filled form, with a name standing in for a ticker", () => {
    expect(holdingFormProblems(filled, ".")).toEqual({});
    expect(holdingFormProblems({ ...filled, ticker: "", name: "Company 401k fund" }, ".")).toEqual({});
  });

  it("mirrors the server's limits", () => {
    expect(holdingFormProblems({ ...filled, quantity: "0" }, ".").quantity).toBe("must_be_positive");
    expect(holdingFormProblems({ ...filled, quantity: "1.12345678901" }, ".").quantity).toBe("too_many_decimals");
    expect(holdingFormProblems({ ...filled, quantity: "10000000000000" }, ".").quantity).toBe("too_large");
    expect(holdingFormProblems({ ...filled, price: "0" }, ".").price).toBeUndefined();
    expect(holdingFormProblems({ ...filled, price: "1.123456789" }, ".").price).toBe("too_many_decimals");
    expect(holdingFormProblems({ ...filled, ticker: "BAD TICKER" }, ".").ticker).toBe("ticker_format");
    expect(holdingFormProblems({ ...filled, costBasis: "abc" }, ".").costBasis).toBe("not_a_number");
    expect(holdingFormProblems({ ...filled, financialAccountId: "" }, ".").financialAccountId).toBe("account_required");
  });
});

describe("toHoldingCreateRequest", () => {
  it("sends decimals as strings, the ticker upper-cased and a blank cost basis as null", () => {
    expect(toHoldingCreateRequest({ ...filled, quantity: "1,000.25" }, ".")).toEqual({
      financial_account_id: "a1", ticker_symbol: "VTI", name: null, security_type: "equity",
      quantity: "1000.25", price: "250.1234", cost_basis_cents: null,
    });
  });
});

describe("toHoldingUpdateRequest", () => {
  it("sends only what changed", () => {
    const before = holdingToFormValues(holding());
    expect(toHoldingUpdateRequest(before, before, ".")).toEqual({});
    expect(toHoldingUpdateRequest(before, { ...before, price: "260" }, ".")).toEqual({ price: "260" });
    expect(toHoldingUpdateRequest(before, { ...before, costBasis: "" }, ".")).toEqual({ cost_basis_cents: null });
    expect(toHoldingUpdateRequest(before, { ...before, ticker: "voo" }, ".")).toEqual({
      ticker_symbol: "VOO", name: "Vanguard",
    });
  });
});

describe("holdingToFormValues", () => {
  it("drops the server's trailing zeros", () => {
    expect(holdingToFormValues(holding())).toMatchObject({ quantity: "10.5", price: "250.1234", costBasis: "2000" });
    expect(trimDecimal("100.000")).toBe("100");
  });
});

describe("holding formatting", () => {
  it("keeps every share decimal and sub-cent prices", () => {
    expect(formatQuantity("1234.5000")).toBe("1,234.5");
    expect(formatQuantity(null)).toBe("—");
    expect(formatPrice("250.12340000", "USD")).toBe("$250.1234");
    expect(formatPrice("10", "USD")).toBe("$10.00");
  });

  it("signs a percent and names the direction", () => {
    expect(formatGainLossPercent(12.34)).toBe("+12.3%");
    expect(formatGainLossPercent(-4)).toBe("-4.0%");
    expect(formatGainLossPercent(null)).toBe("—");
    expect([gainLossDirection(1), gainLossDirection(-1), gainLossDirection(0), gainLossDirection(null)])
      .toEqual(["gain", "loss", "flat", null]);
  });
});
