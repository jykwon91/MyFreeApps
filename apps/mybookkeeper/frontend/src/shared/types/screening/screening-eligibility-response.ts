/**
 * Mirrors backend ``ScreeningEligibilityResponse``.
 *
 * ``eligible`` — True iff name + contact method are present on the applicant.
 * ``missing_fields`` — human-readable list of what's missing when not eligible.
 * ``has_pending`` — True iff a "pending" screening result is already in flight.
 */
export interface ScreeningEligibilityResponse {
  eligible: boolean;
  missing_fields: string[];
  has_pending: boolean;
}
