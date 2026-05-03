import type { ApplicantEvent } from "./applicant-event";
import type { ApplicantReference } from "./applicant-reference";
import type { ApplicantStage } from "./applicant-stage";
import type { ScreeningResult } from "./screening-result";
import type { VideoCallNote } from "./video-call-note";

/**
 * Mirrors backend ``ApplicantDetailResponse`` — the full applicant detail
 * shape with all 1:N children nested.
 *
 * PII fields (``legal_name``, ``dob``, ``employer_or_hospital``,
 * ``vehicle_make_model``) come over the wire as plaintext — the backend's
 * ``EncryptedString`` TypeDecorator decrypts on read. The frontend renders
 * them behind a sensitive-unlock toggle so they're hidden by default per
 * RENTALS_PLAN.md §9.1.
 */
export interface ApplicantDetailResponse {
  id: string;
  organization_id: string;
  user_id: string;
  inquiry_id: string | null;

  legal_name: string | null;
  dob: string | null;
  employer_or_hospital: string | null;
  vehicle_make_model: string | null;
  id_document_storage_key: string | null;

  contract_start: string | null;
  contract_end: string | null;
  smoker: boolean | null;
  pets: string | null;
  referred_by: string | null;

  stage: ApplicantStage;

  tenant_ended_at: string | null;
  tenant_ended_reason: string | null;

  created_at: string;
  updated_at: string;

  screening_results: ScreeningResult[];
  references: ApplicantReference[];
  video_call_notes: VideoCallNote[];
  events: ApplicantEvent[];
}
