import { describe, it, expect } from "vitest";
import { buildTenantOptions, isTenantEnded } from "@/shared/lib/tenant-status";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";

const TODAY = "2026-09-19";

function tenant(overrides: Partial<ApplicantSummary>): ApplicantSummary {
  return {
    id: "t",
    organization_id: "o",
    user_id: "u",
    inquiry_id: null,
    legal_name: "Tenant",
    employer_or_hospital: null,
    contract_start: null,
    contract_end: null,
    stage: "lease_signed",
    tenant_ended_at: null,
    tenant_ended_reason: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("isTenantEnded", () => {
  it("is ended when the host ended the tenancy", () => {
    expect(isTenantEnded(tenant({ tenant_ended_at: "2026-09-01T00:00:00Z" }), TODAY)).toBe(true);
  });

  it("is ended when the lease expired before today", () => {
    expect(isTenantEnded(tenant({ contract_end: "2026-09-18" }), TODAY)).toBe(true);
  });

  it("is active on the lease's last day and with no end date", () => {
    expect(isTenantEnded(tenant({ contract_end: TODAY }), TODAY)).toBe(false);
    expect(isTenantEnded(tenant({}), TODAY)).toBe(false);
  });
});

describe("buildTenantOptions", () => {
  it("lists active tenants first and suffixes ended ones", () => {
    const options = buildTenantOptions(
      [
        tenant({ id: "e", legal_name: "Prince Kapoor", tenant_ended_at: "2026-09-01T00:00:00Z" }),
        tenant({ id: "a", legal_name: "Dana Wells" }),
        tenant({ id: "n", legal_name: null }),
      ],
      TODAY,
    );
    expect(options).toEqual([
      { id: "a", label: "Dana Wells" },
      { id: "n", label: "Unnamed" },
      { id: "e", label: "Prince Kapoor (ended)" },
    ]);
  });
});
