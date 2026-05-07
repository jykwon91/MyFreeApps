import type { SignedLeaseStatus } from "@/shared/types/lease/signed-lease-status";

export interface SignedLeaseSummary {
  id: string;
  user_id: string;
  organization_id: string;
  /** Ordered template IDs (display_order ascending). Empty for imported leases. */
  template_ids: string[];
  applicant_id: string;
  listing_id: string | null;
  kind: "generated" | "imported";
  status: SignedLeaseStatus;
  starts_on: string | null;
  ends_on: string | null;
  generated_at: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;

  /** Decrypted applicant name from applicants.legal_name. Null if not set. */
  applicant_legal_name: string | null;
}
