import { describe, expect, it } from "vitest";
import type { SignedLeaseTemplateLink } from "../types/lease/signed-lease-template-link";
import { leaseTemplateSourceLabel } from "../utils/leaseTemplateSourceLabel";

function link(overrides: Partial<SignedLeaseTemplateLink>): SignedLeaseTemplateLink {
  return {
    id: "t1",
    name: "Renamed later",
    version: 5,
    display_order: 0,
    template_name_snapshot: "Master Lease",
    template_version_snapshot: 3,
    ...overrides,
  };
}

describe("leaseTemplateSourceLabel", () => {
  it("names the rendered template and version, not the current ones", () => {
    expect(leaseTemplateSourceLabel(link({}))).toBe("Generated from Master Lease v3");
  });

  it("leaves the version off when it is unknown", () => {
    expect(leaseTemplateSourceLabel(link({ template_version_snapshot: null }))).toBe("Generated from Master Lease");
  });

  it("is null for a template not rendered yet", () => {
    expect(leaseTemplateSourceLabel(link({ template_name_snapshot: null, template_version_snapshot: null }))).toBeNull();
  });
});
