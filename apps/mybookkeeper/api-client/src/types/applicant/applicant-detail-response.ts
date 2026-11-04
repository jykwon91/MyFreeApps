import type { ApplicantEvent } from "./applicant-event";
import type { ApplicantReference } from "./applicant-reference";
import type { ApplicantStage } from "./applicant-stage";
import type { ScreeningResult } from "./screening-result";
import type { VideoCallNote } from "./video-call-note";

/**
 * Mirrors backend ``ApplicantDetailResponse`` — the full applicant detail
 * shape with all 1:N children nested.
 *
 * Date of birth, vehicle, contact details and screening reports aren't here:
 * they come from ``revealApplicantSensitive``, which records who asked.
 */
export interface ApplicantDetailResponse {
  id: string;
  organization_id: string;
  user_id: string;
  inquiry_id: string | null;

  legal_name: string | null;
  employer_or_hospital: string | null;
  has_contact_email: boolean;

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
