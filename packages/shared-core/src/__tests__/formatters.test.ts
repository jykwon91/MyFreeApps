import { describe, expect, it } from "vitest";
import { formatCount } from "../utils/count";
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

describe("formatCount", () => {
  it("uses the singular only for exactly one", () => {
    expect(formatCount(1, "failed document")).toBe("1 failed document");
    expect(formatCount(0, "failed document")).toBe("0 failed documents");
    expect(formatCount(3, "failed document")).toBe("3 failed documents");
  });

  it("takes an irregular plural", () => {
    expect(formatCount(2, "property", "properties")).toBe("2 properties");
    expect(formatCount(1, "property", "properties")).toBe("1 property");
  });
});
