import type { ApplicantStage } from "./applicant-stage";

/**
 * Mirrors backend ``ApplicantSummary`` Pydantic schema — the list-card shape
 * returned by GET /applicants.
 *
 * Excludes DOB / vehicle / ID document key per RENTALS_PLAN.md §9.1
 * information hierarchy — those live behind the sensitive-unlock toggle on
 * the detail page only.
 */
export interface ApplicantSummary {
  id: string;
  organization_id: string;
  user_id: string;
  inquiry_id: string | null;

  legal_name: string | null;
  employer_or_hospital: string | null;

  contract_start: string | null;
  contract_end: string | null;

  stage: ApplicantStage;

  created_at: string;
  updated_at: string;
}
