import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";

export function aLease(overrides: Partial<SignedLeaseDetail> = {}): SignedLeaseDetail {
  return {
    id: "l1",
    user_id: "u1",
    organization_id: "w1",
    templates: [],
    applicant_id: "a1",
    applicant_legal_name: "Dana Reed",
    listing_id: null,
    kind: "imported",
    values: {},
    status: "active",
    starts_on: "2026-03-01",
    ends_on: "2027-02-28",
    notes: null,
    generated_at: null,
    sent_at: null,
    signed_at: null,
    ended_at: null,
    auto_email_tenant: false,
    last_emailed_to_tenant_at: null,
    created_at: "2026-02-01T12:00:00Z",
    updated_at: "2026-02-01T12:00:00Z",
    attachments: [],
    latest_extension: null,
    parent_lease_id: null,
    successor_lease_id: null,
    documents_locked: false,
    ...overrides,
  };
}
