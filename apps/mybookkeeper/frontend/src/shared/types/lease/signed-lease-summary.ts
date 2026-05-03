import type { SignedLeaseStatus } from "@/shared/types/lease/signed-lease-status";

export interface SignedLeaseSummary {
  id: string;
  user_id: string;
  organization_id: string;
  template_id: string;
  applicant_id: string;
  listing_id: string | null;
  status: SignedLeaseStatus;
  starts_on: string | null;
  ends_on: string | null;
  generated_at: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}
