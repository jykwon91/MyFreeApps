import { describe, expect, it } from "vitest";
import { overrideFieldBody, parseTaxFieldOverride, taxFieldEditText, taxFieldOverrideProblems } from "../utils/taxFieldOverride";
import { isMaskedTaxValue } from "../utils/isMaskedTaxValue";

const num = (value: number | null) => ({ field_type: "numeric", value });

describe("parseTaxFieldOverride", () => {
  it.each([
    ["1250.50", 1250.5],
    ["  42 ", 42],
    ["-3", -3],
    ["$1,250.50", 1250.5],
    [".5", 0.5],
    ["12.", 12],
    ["+7", 7],
    ["$-5", -5],
    ["-$5", -5],
    ["(500)", -500],
    ["1 250", 1250],
  ])("reads %s as a number", (text, value) => {
    expect(parseTaxFieldOverride("numeric", text, false)).toEqual(num(value));
  });

  it.each(["abc", "12abc", "1e3", "1,2", "--4", "$", ".", "1.2.3", "(5", "5)", "-(5)"])("rejects %s instead of sending null", (text) => {
    expect(parseTaxFieldOverride("numeric", text, true)).toBeNull();
  });

  it("only treats a blank number as clearing when that was meant", () => {
    expect(parseTaxFieldOverride("numeric", " ", false)).toBeNull();
    expect(parseTaxFieldOverride("numeric", " ", true)).toEqual(num(null));
  });

  it("reads booleans and text", () => {
    expect(parseTaxFieldOverride("boolean", "True", false)).toEqual({ field_type: "boolean", value: true });
    expect(parseTaxFieldOverride("boolean", "1", false)).toEqual({ field_type: "boolean", value: true });
    expect(parseTaxFieldOverride("boolean", "false", false)).toEqual({ field_type: "boolean", value: false });
    expect(parseTaxFieldOverride("text", "  Acme ", false)).toEqual({ field_type: "text", value: "Acme" });
    expect(parseTaxFieldOverride("text", "", false)).toBeNull();
    expect(parseTaxFieldOverride("text", "", true)).toEqual({ field_type: "text", value: null });
  });

  it("keeps within the server's limits: 12 digits with 2 decimals, 500 characters", () => {
    expect(parseTaxFieldOverride("numeric", "9999999999.99", false)).toEqual(num(9999999999.99));
    expect(parseTaxFieldOverride("numeric", "10000000000", false)).toBeNull();
    expect(parseTaxFieldOverride("numeric", "1.234", false)).toBeNull();
    expect(parseTaxFieldOverride("text", "a".repeat(500), false)).toEqual({ field_type: "text", value: "a".repeat(500) });
    expect(parseTaxFieldOverride("text", "a".repeat(501), false)).toBeNull();
    expect(taxFieldOverrideProblems("text", "a".repeat(501), "why", false).number).toMatch(/500/);
  });

  it("sends null for a blank yes or no only when clearing was meant", () => {
    expect(parseTaxFieldOverride("boolean", " ", true)).toEqual({ field_type: "boolean", value: null });
    expect(parseTaxFieldOverride("boolean", " ", false)).toEqual({ field_type: "boolean", value: false });
  });

  it("refuses a hidden value in a text field", () => {
    expect(parseTaxFieldOverride("text", "***1234", false)).toBeNull();
  });
});

describe("isMaskedTaxValue", () => {
  it("spots hidden values only", () => {
    expect(isMaskedTaxValue("***1234")).toBe(true);
    expect(isMaskedTaxValue("***-**-6789")).toBe(true);
    expect(isMaskedTaxValue("123-45-6789")).toBe(false);
    expect(isMaskedTaxValue("a*b")).toBe(false);
  });
});

describe("taxFieldOverrideProblems", () => {
  it("points at an unreadable number and a missing reason separately", () => {
    expect(Object.keys(taxFieldOverrideProblems("numeric", "x", "", false)).sort()).toEqual(["number", "reason"]);
    expect(Object.keys(taxFieldOverrideProblems("numeric", "5", " ", false))).toEqual(["reason"]);
    expect(taxFieldOverrideProblems("numeric", "5", "Typo on the form", false)).toEqual({});
  });

  it("says a hidden value can't be saved", () => {
    expect(taxFieldOverrideProblems("text", "***1234", "Typo", false).number).toMatch(/hidden/);
  });
});

describe("taxFieldEditText", () => {
  it("starts from the raw value", () => {
    const base = { field_id: "box_1" } as const;
    expect(taxFieldEditText({ ...base, type: "numeric", value: 12.5 })).toBe("12.5");
    expect(taxFieldEditText({ ...base, type: "boolean", value: true })).toBe("true");
    expect(taxFieldEditText({ ...base, type: "boolean", value: false })).toBe("false");
    expect(taxFieldEditText({ ...base, type: "text", value: null })).toBe("");
  });

  it("never pre-fills a hidden or identifying value", () => {
    expect(taxFieldEditText({ field_id: "recipient_tin", type: "text", value: "***1234" })).toBe("");
    expect(taxFieldEditText({ field_id: "ssn", type: "text", value: "123-45-6789" })).toBe("");
    expect(taxFieldEditText({ field_id: "payer_name", type: "text", value: "***1234" })).toBe("");
  });
});

describe("overrideFieldBody", () => {
  it("sends the value in the column for the field's type", () => {
    const base = { return_id: "r", field_id: "f", override_reason: "why" };
    expect(overrideFieldBody({ ...base, field_type: "numeric", value: 5 })).toEqual({ override_reason: "why", value_numeric: 5 });
    expect(overrideFieldBody({ ...base, field_type: "boolean", value: true })).toEqual({ override_reason: "why", value_boolean: true });
    expect(overrideFieldBody({ ...base, field_type: "text", value: "x" })).toEqual({ override_reason: "why", value_text: "x" });
  });

  it("sends an explicit null to clear", () => {
    const base = { return_id: "r", field_id: "f", override_reason: "why" };
    expect(overrideFieldBody({ ...base, field_type: "numeric", value: null })).toEqual({ override_reason: "why", value_numeric: null });
    expect(overrideFieldBody({ ...base, field_type: "text", value: null })).toEqual({ override_reason: "why", value_text: null });
  });
});
