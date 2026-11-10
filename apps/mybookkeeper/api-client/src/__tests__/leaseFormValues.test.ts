import { describe, expect, it } from "vitest";
import type { LeaseTemplatePlaceholder } from "../types/lease/lease-template-placeholder";
import type { MergedPlaceholder } from "../types/lease/merged-placeholder";
import {
  hasChanges,
  leaseValues,
  missingRequired,
  placeholderProvenance,
  placeholderValue,
  unreadableNumbers,
} from "../utils/leaseFormValues";
import { singleTemplateFields } from "../utils/leasePlaceholders";

function aField(key: string, value: string | null, inputType = "text", required = true): MergedPlaceholder {
  const placeholder = { id: key, key, display_label: key, input_type: inputType, required } as LeaseTemplatePlaceholder;
  return { placeholder, template_ids: ["t1"], value, provenance: value === null ? null : "applicant" };
}

const FIELDS = [aField("name", "Jane"), aField("email", null, "email", false), aField("rent", "100", "number")];

describe("lease form values", () => {
  it("shows the pulled value until it is edited", () => {
    expect(placeholderValue(FIELDS[0], {})).toBe("Jane");
    expect(placeholderValue(FIELDS[0], { name: "Typed" })).toBe("Typed");
    expect(placeholderValue(FIELDS[1], {})).toBe("");
  });

  it("calls an edit manual only when it differs from the pulled value", () => {
    expect(placeholderProvenance(FIELDS[0], { name: "Typed" })).toBe("manual");
    expect(placeholderProvenance(FIELDS[0], { name: "Jane" })).toBe("applicant");
    expect(hasChanges(FIELDS, { name: "Jane" })).toBe(false);
    expect(hasChanges(FIELDS, { email: "a@b.c" })).toBe(true);
  });

  it("finds required fields left blank and unreadable numbers", () => {
    expect(missingRequired(FIELDS, { name: "  " }).map((f) => f.placeholder.key)).toEqual(["name"]);
    expect(unreadableNumbers(FIELDS, { rent: "abc" }).map((f) => f.placeholder.key)).toEqual(["rent"]);
  });

  it("sends trimmed values for the current fields only", () => {
    expect(leaseValues(FIELDS, { name: " Typed ", gone: "stale" })).toEqual({ name: "Typed", email: "", rent: "100" });
  });

  it("merges one template's placeholders with their pulled defaults", () => {
    const merged = singleTemplateFields("t1", FIELDS.map((f) => f.placeholder), [
      { key: "name", value: "Jane", provenance: "applicant" },
    ]);
    expect(merged.map((f) => [f.placeholder.key, f.value, f.template_ids])).toEqual([
      ["name", "Jane", ["t1"]],
      ["email", null, ["t1"]],
      ["rent", null, ["t1"]],
    ]);
  });
});
