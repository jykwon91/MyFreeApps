/**
 * Mirrors backend ``ApplicantPromoteRequest`` — the body for
 * POST /applicants/promote/{inquiry_id}.
 *
 * All fields are optional. The backend auto-fills missing values from the
 * source inquiry where possible (legal_name, employer_or_hospital,
 * contract_start). Fields with no inquiry source (dob, vehicle_make_model,
 * smoker, pets, referred_by) come from this payload only.
 *
 * ``contract_end`` is no longer accepted: it is derived from the latest
 * signed lease's end date. The host enters the end date when creating the
 * lease draft.
 *
 * Dates are ISO-8601 ``YYYY-MM-DD`` strings on the wire.
 */
export interface ApplicantPromoteRequest {
  legal_name?: string | null;
  dob?: string | null;
  employer_or_hospital?: string | null;

  contract_start?: string | null;

  vehicle_make_model?: string | null;
  smoker?: boolean | null;
  pets?: string | null;
  referred_by?: string | null;
}
