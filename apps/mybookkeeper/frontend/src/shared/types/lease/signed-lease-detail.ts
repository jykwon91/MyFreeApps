import type { SignedLeaseAttachment } from "@/shared/types/lease/signed-lease-attachment";
import type { SignedLeaseStatus } from "@/shared/types/lease/signed-lease-status";

export interface SignedLeaseDetail {
  id: string;
  user_id: string;
  organization_id: string;
  template_id: string | null;
  applicant_id: string;
  listing_id: string | null;
  kind: "generated" | "imported";
  values: Record<string, unknown>;
  status: SignedLeaseStatus;
  starts_on: string | null;
  ends_on: string | null;
  notes: string | null;
  generated_at: string | null;
  sent_at: string | null;
  signed_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  attachments: SignedLeaseAttachment[];
}
