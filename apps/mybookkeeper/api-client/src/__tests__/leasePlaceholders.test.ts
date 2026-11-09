import { describe, expect, it } from "vitest";
import type { LeasePlaceholderInputType } from "../types/lease/lease-placeholder-input-type";
import type { LeaseTemplatePlaceholder } from "../types/lease/lease-template-placeholder";
import type { MergedPlaceholder } from "../types/lease/merged-placeholder";
import { askedFields, computedFields, isAskedPlaceholder, placeholderNumberUnreadable } from "../utils/leasePlaceholders";

function aField(key: string, input_type: LeasePlaceholderInputType): MergedPlaceholder {
  const placeholder = { id: key, key, display_label: key, input_type, required: true } as LeaseTemplatePlaceholder;
  return { placeholder, template_ids: ["t1"], value: null, provenance: null };
}

const FIELDS = [aField("name", "text"), aField("sig", "signature"), aField("total", "computed"), aField("rent", "number")];

describe("lease placeholders", () => {
  it("asks for everything except signatures and computed values", () => {
    expect(askedFields(FIELDS).map((f) => f.placeholder.key)).toEqual(["name", "rent"]);
    expect(isAskedPlaceholder(FIELDS[1].placeholder)).toBe(false);
  });

  it("lists the computed ones apart", () => {
    expect(computedFields(FIELDS).map((f) => f.placeholder.key)).toEqual(["total"]);
  });

  it("flags only a typed number that can't be read", () => {
    const rent = FIELDS[3].placeholder;
    expect(placeholderNumberUnreadable(rent, "lots")).toBe(true);
    expect(placeholderNumberUnreadable(rent, "$1,200")).toBe(false);
    expect(placeholderNumberUnreadable(rent, "  ")).toBe(false);
    expect(placeholderNumberUnreadable(FIELDS[0].placeholder, "lots")).toBe(false);
  });
});
