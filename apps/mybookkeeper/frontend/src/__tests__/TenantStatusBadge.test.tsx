import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TenantStatusBadge from "@/app/features/tenants/TenantStatusBadge";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";

const base: ApplicantSummary = {
  id: "app-1",
  organization_id: "org-1",
  user_id: "user-1",
  inquiry_id: null,
  legal_name: "Jane Doe",
  employer_or_hospital: "Memorial Hermann",
  contract_start: "2026-01-01",
  contract_end: "2026-12-31",
  stage: "lease_signed",
  tenant_ended_at: null,
  tenant_ended_reason: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("TenantStatusBadge", () => {
  it("shows 'Active' when tenant_ended_at is null and contract is in the future", () => {
    render(<TenantStatusBadge tenant={base} today="2026-06-01" />);
    expect(screen.getByTestId("tenant-status-badge-active")).toBeInTheDocument();
    expect(screen.queryByTestId("tenant-status-badge-ended")).toBeNull();
  });

  it("shows 'Ended' when tenant_ended_at is set", () => {
    render(
      <TenantStatusBadge
        tenant={{ ...base, tenant_ended_at: "2026-05-01T12:00:00Z" }}
        today="2026-06-01"
      />,
    );
    expect(screen.getByTestId("tenant-status-badge-ended")).toBeInTheDocument();
    expect(screen.queryByTestId("tenant-status-badge-active")).toBeNull();
  });

  it("shows 'Ended' when contract_end is before today", () => {
    render(
      <TenantStatusBadge
        tenant={{ ...base, contract_end: "2026-04-30" }}
        today="2026-05-01"
      />,
    );
    expect(screen.getByTestId("tenant-status-badge-ended")).toBeInTheDocument();
  });

  it("shows 'Active' when contract_end equals today (not yet ended)", () => {
    render(
      <TenantStatusBadge
        tenant={{ ...base, contract_end: "2026-06-01" }}
        today="2026-06-01"
      />,
    );
    // contract_end === today → not < today, so still active
    expect(screen.getByTestId("tenant-status-badge-active")).toBeInTheDocument();
  });

  it("shows 'Active' when contract_end is null", () => {
    render(
      <TenantStatusBadge
        tenant={{ ...base, contract_end: null }}
        today="2026-06-01"
      />,
    );
    expect(screen.getByTestId("tenant-status-badge-active")).toBeInTheDocument();
  });
});
