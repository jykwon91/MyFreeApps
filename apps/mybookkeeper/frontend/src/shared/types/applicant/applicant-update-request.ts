/**
 * Request body for PATCH /applicants/{id} — contract date update.
 *
 * Both fields are optional. Omitting a field means "leave it unchanged".
 * Dates are ISO-8601 strings (YYYY-MM-DD) when provided.
 */
export interface ApplicantUpdateRequest {
  contract_start?: string | null;
  contract_end?: string | null;
}
