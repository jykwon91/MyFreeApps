import { describe, expect, it } from "vitest";
import { formatTaxFieldValue } from "../utils/formatTaxFieldValue";
import { maskTaxValue } from "../utils/maskTaxValue";
import { taxFieldSourceMode } from "../utils/taxFieldSourceMode";

describe("maskTaxValue", () => {
  it("masks identifying fields to their last four", () => {
    expect(maskTaxValue("ssn", "123456789")).toBe("***6789");
    expect(maskTaxValue("ssn", "12")).toBe("****");
  });
  it("masks a Social Security number inside other text", () => {
    expect(maskTaxValue("notes", "SSN 123-45-6789 on file")).toBe("SSN ***-**-6789 on file");
  });
});

describe("formatTaxFieldValue", () => {
  it("formats by type", () => {
    expect(formatTaxFieldValue({ field_id: "a", type: "numeric", value: 1234.5 })).toBe("$1,234.50");
    expect(formatTaxFieldValue({ field_id: "a", type: "boolean", value: false })).toBe("No");
    expect(formatTaxFieldValue({ field_id: "a", type: "text", value: "Acme" })).toBe("Acme");
    expect(formatTaxFieldValue({ field_id: "a", type: "text", value: null })).toBe("—");
    expect(formatTaxFieldValue({ field_id: "recipient_tin", type: "text", value: "987654321" })).toBe("***4321");
  });
});

describe("taxFieldSourceMode", () => {
  it("lets calculated win over overridden", () => {
    expect(taxFieldSourceMode({ is_calculated: true, is_overridden: true })).toBe("calculated");
    expect(taxFieldSourceMode({ is_calculated: false, is_overridden: true })).toBe("overridden");
    expect(taxFieldSourceMode({ is_calculated: false, is_overridden: false })).toBe("sourced");
  });
});
