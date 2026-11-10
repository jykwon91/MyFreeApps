import { describe, expect, it } from "vitest";
import type { LeasePlaceholderFormValues } from "../types/lease/lease-placeholder-form-values";
import type { LeaseTemplatePlaceholder } from "../types/lease/lease-template-placeholder";
import { splitSuggestions } from "../utils/leaseSuggestions";
import { placeholderDirtyFields, placeholderFormProblems, placeholderToFormValues, placeholderUpdateRequest } from "../utils/leasePlaceholderForm";

const placeholder: LeaseTemplatePlaceholder = {
  id: "p1",
  template_id: "t1",
  key: "TENANT FULL NAME",
  display_label: "Tenant full name",
  input_type: "text",
  required: true,
  default_source: "applicant.legal_name",
  computed_expr: null,
  display_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("placeholder form saved values", () => {
  const started = placeholderToFormValues(placeholder);

  it("compares trimmed text, so stray spaces are not an edit", () => {
    expect(placeholderDirtyFields({ ...started, display_label: " Tenant full name ", default_source: "applicant.legal_name  " }, started)).toEqual([]);
    expect(placeholderUpdateRequest({ ...started, display_label: "  Renter  " }, ["display_label"])).toEqual({ display_label: "Renter" });
  });

  it("treats a default that is only spaces as clearing it", () => {
    expect(placeholderDirtyFields({ ...started, default_source: "   " }, started)).toEqual(["default_source"]);
    expect(placeholderUpdateRequest({ ...started, default_source: "   " }, ["default_source"])).toEqual({ default_source: null });
  });

  it("leaves out an expression the form hides once the type is no longer computed", () => {
    const computed = { ...started, input_type: "computed" as const, computed_expr: "(A - B).days" };
    expect(placeholderDirtyFields({ ...computed, input_type: "text", computed_expr: "edited" }, computed)).toEqual(["input_type"]);
    expect(placeholderDirtyFields({ ...computed, computed_expr: "(A - C).days" }, computed)).toEqual(["computed_expr"]);
    expect(placeholderDirtyFields({ ...started, input_type: "computed", computed_expr: "(A - B).days" }, started)).toEqual(["input_type", "computed_expr"]);
  });

  it("checks lengths on the trimmed text", () => {
    expect(placeholderFormProblems({ ...started, display_label: `${"x".repeat(200)}   ` })).toEqual({});
    expect(placeholderFormProblems({ ...started, default_source: `${"x".repeat(120)}  ` })).toEqual({});
  });
});

describe("placeholder form", () => {
  it("turns a missing default and expression into blank text", () => {
    expect(placeholderToFormValues(placeholder)).toEqual({
      display_label: "Tenant full name",
      input_type: "text",
      required: true,
      default_source: "applicant.legal_name",
      computed_expr: "",
    });
  });

  it("names the fields that differ from where the form started", () => {
    const started = placeholderToFormValues(placeholder);
    expect(placeholderDirtyFields(started, started)).toEqual([]);
    expect(placeholderDirtyFields({ ...started, required: false, default_source: "" }, started)).toEqual(["required", "default_source"]);
  });

  it("sends only the named fields, and a blank default or expression as null", () => {
    const values: LeasePlaceholderFormValues = { display_label: "Name", input_type: "computed", required: false, default_source: "", computed_expr: "" };
    expect(placeholderUpdateRequest(values, ["required"])).toEqual({ required: false });
    expect(placeholderUpdateRequest(values, ["default_source", "computed_expr"])).toEqual({ default_source: null, computed_expr: null });
    expect(placeholderUpdateRequest({ ...values, computed_expr: "(A - B).days" }, ["display_label", "input_type", "computed_expr"])).toEqual({
      display_label: "Name",
      input_type: "computed",
      computed_expr: "(A - B).days",
    });
  });

  it("asks for a label, and keeps the label and default inside the column sizes", () => {
    const values = placeholderToFormValues(placeholder);
    expect(placeholderFormProblems(values)).toEqual({});
    expect(placeholderFormProblems({ ...values, display_label: "   " })).toEqual({ display_label: "label_required" });
    expect(placeholderFormProblems({ ...values, display_label: "x".repeat(201) })).toEqual({ display_label: "label_too_long" });
    expect(placeholderFormProblems({ ...values, default_source: "x".repeat(121) })).toEqual({ default_source: "default_source_too_long" });
  });
});

describe("splitSuggestions", () => {
  it("separates the suggestions the template already has from the new ones", () => {
    const suggestions = [
      { key: "TENANT FULL NAME", description: "", input_type: "text" as const },
      { key: "PET DEPOSIT", description: "", input_type: "number" as const },
    ];
    const split = splitSuggestions(suggestions, new Set(["TENANT FULL NAME"]));
    expect([...split.newKeys]).toEqual(["PET DEPOSIT"]);
    expect(split.matchedCount).toBe(1);
    expect(splitSuggestions([], new Set()).matchedCount).toBe(0);
  });
});
