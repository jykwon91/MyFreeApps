import { describe, expect, it } from "vitest";
import type { SignedLeaseTemplatePrefillItem } from "../types/lease/signed-lease-template-prefill";
import { prefillItemsToAsk, prefillProblems, prefillProvenanceLabel, SAVED_ON_LEASE_LABEL } from "../utils/leasePrefill";

function anItem(overrides: Partial<SignedLeaseTemplatePrefillItem> = {}): SignedLeaseTemplatePrefillItem {
  return { key: "rent", display_label: "Monthly rent", input_type: "number", required: true, value: "", provenance: null, is_from_existing_values: false, ...overrides };
}

describe("prefillProvenanceLabel", () => {
  it("prefers a value saved on the lease", () => {
    expect(prefillProvenanceLabel(anItem({ is_from_existing_values: true, provenance: "applicant" }))).toBe(SAVED_ON_LEASE_LABEL);
  });

  it("names a known source", () => {
    expect(prefillProvenanceLabel(anItem({ provenance: "property" }))).toBe("from property");
  });

  it("says nothing for no source or one it doesn't know", () => {
    expect(prefillProvenanceLabel(anItem())).toBeNull();
    expect(prefillProvenanceLabel(anItem({ provenance: "mystery" }))).toBeNull();
  });
});

describe("what the form asks for", () => {
  const items = [anItem(), anItem({ key: "sig", display_label: "Signature", input_type: "signature" }), anItem({ key: "note", display_label: "Note", input_type: "text", required: false })];

  it("never asks for a signature", () => {
    expect(prefillItemsToAsk(items).map((item) => item.key)).toEqual(["rent", "note"]);
  });

  it("flags a missing required field and a number that can't be read, each on its own field", () => {
    expect(prefillProblems(items, {})).toEqual({ rent: "required" });
    expect(prefillProblems(items, { rent: "lots" })).toEqual({ rent: "not_a_number" });
    expect(prefillProblems(items, { rent: "$1,500.00", note: "anything" })).toEqual({});
  });

  it("lets an optional number stay blank", () => {
    expect(prefillProblems([anItem({ required: false })], { rent: "" })).toEqual({});
  });
});
