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
}
