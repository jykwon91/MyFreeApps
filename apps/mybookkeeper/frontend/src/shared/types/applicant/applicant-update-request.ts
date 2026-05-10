/**
 * Request body for PATCH /applicants/{id}.
 *
 * Only ``contract_start`` is mutable on the applicant. ``contract_end`` is
 * derived from the latest signed lease's end date and is therefore output-
 * only — sending it returns 422.
 *
 * Dates are ISO-8601 strings (YYYY-MM-DD) when provided.
 */
export interface ApplicantUpdateRequest {
  contract_start?: string | null;
}
