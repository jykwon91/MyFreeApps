import { describe, expect, it } from "vitest";
import { formatCurrency } from "../utils/currency";
import { formatTag } from "../utils/tag";

describe("formatCurrency", () => {
  it("formats numbers and the strings the API sends", () => {
    expect(formatCurrency(1200)).toBe("$1,200.00");
    expect(formatCurrency("84.2")).toBe("$84.20");
  });

  it("shows a dash when there's no number", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency("not a number")).toBe("—");
  });
});

describe("formatTag", () => {
  it("turns a stored value into words", () => {
    expect(formatTag("mortgage_interest")).toBe("Mortgage Interest");
  });
});
