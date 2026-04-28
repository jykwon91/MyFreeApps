/**
 * Mirrors backend ``ApplicantPromoteRequest`` — the body for
 * POST /applicants/promote/{inquiry_id}.
 *
 * All fields are optional. The backend auto-fills missing values from the
 * source inquiry where possible (legal_name, employer_or_hospital, contract
 * dates). Fields with no inquiry source (dob, vehicle_make_model, smoker,
 * pets, referred_by) come from this payload only.
 *
 * Dates are ISO-8601 ``YYYY-MM-DD`` strings on the wire.
 */
export interface ApplicantPromoteRequest {
  legal_name?: string | null;
  dob?: string | null;
  employer_or_hospital?: string | null;

  contract_start?: string | null;
  contract_end?: string | null;

  vehicle_make_model?: string | null;
  smoker?: boolean | null;
  pets?: string | null;
  referred_by?: string | null;
}
