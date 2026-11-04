/**
 * Mirrors backend ``ReferenceResponse``. How to reach them comes from
 * ``revealApplicantSensitive``.
 */
export interface ApplicantReference {
  id: string;
  applicant_id: string;
  relationship: string;
  reference_name: string;
  notes: string | null;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
}
