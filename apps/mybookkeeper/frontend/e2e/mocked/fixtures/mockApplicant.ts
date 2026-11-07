/** One applicant ready for screening, as the detail and screening endpoints return it, for no-backend specs. */
import { ORG_ID } from "./mockSession";

export const APPLICANT_ID = "00000000-0000-0000-0000-0000000000b1";

export const APPLICANT_DETAIL = {
  id: APPLICANT_ID,
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  inquiry_id: null,
  legal_name: "Jane Doe",
  employer_or_hospital: "Memorial Hermann",
  has_contact_email: false,
  contract_start: "2026-01-01",
  contract_end: "2026-12-31",
  smoker: false,
  pets: null,
  referred_by: null,
  stage: "approved",
  tenant_ended_at: null,
  tenant_ended_reason: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  screening_results: [],
  references: [],
  video_call_notes: [],
  events: [],
};

export const SCREENING_ELIGIBLE = { eligible: true, missing_fields: [], has_pending: false };

export const SCREENING_PROVIDERS = {
  providers: [
    {
      name: "keycheck",
      label: "KeyCheck",
      description: "Comprehensive background check.",
      cost_label: "Free",
      turnaround_label: "Usually 1–2 days",
      external_url: "https://keycheck.example",
    },
  ],
};
