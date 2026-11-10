/** One generated-from-templates lease, as the detail endpoint returns it, for no-backend specs. */
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import { APPLICANT_ID } from "./mockApplicant";
import { ORG_ID } from "./mockSession";

export const LEASE_ID = "00000000-0000-0000-0000-0000000000c1";

export const DRAFT_LEASE: SignedLeaseDetail = {
  id: LEASE_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  organization_id: ORG_ID,
  templates: [
    {
      id: "00000000-0000-0000-0000-0000000000d1",
      name: "Master Lease (renamed)",
      version: 3,
      display_order: 0,
      template_name_snapshot: null,
      template_version_snapshot: null,
    },
    {
      id: "00000000-0000-0000-0000-0000000000d2",
      name: "Pet addendum",
      version: 2,
      display_order: 1,
      template_name_snapshot: null,
      template_version_snapshot: null,
    },
  ],
  applicant_id: APPLICANT_ID,
  applicant_legal_name: "Jane Doe",
  listing_id: null,
  kind: "generated",
  values: {},
  status: "draft",
  starts_on: null,
  ends_on: null,
  notes: null,
  generated_at: null,
  sent_at: null,
  signed_at: null,
  ended_at: null,
  auto_email_tenant: false,
  last_emailed_to_tenant_at: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  attachments: [],
  documents_locked: false,
  latest_extension: null,
  parent_lease_id: null,
  successor_lease_id: null,
};
