/**
 * Body for POST /signed-leases — create a draft from one or more templates.
 *
 * The frontend always sends `template_ids` (the canonical multi-template
 * shape). The legacy `template_id` field is kept on the backend schema for
 * backward compat with older clients but is not used here.
 */
export interface SignedLeaseCreateRequest {
  template_ids: string[];
  applicant_id: string;
  listing_id?: string | null;
  values: Record<string, unknown>;
  /** Optional successor pointer. When set, the parent must exist in the
   *  caller's tenant, be in status signed/active/ended, and not already
   *  have a live successor. The backend returns 422 INVALID_PARENT_LEASE
   *  or 409 SUCCESSOR_ALREADY_EXISTS when the precondition fails. */
  parent_lease_id?: string | null;
}
