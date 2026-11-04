/**
 * Mirrors backend ``LeaseExtensionSummary``.
 *
 * Exposed on ``SignedLeaseDetail.latest_extension`` for the lease detail
 * page to gate the Undo button on the 30-day undo window.
 */
export interface LeaseExtensionSummary {
  id: string;
  created_at: string; // ISO-8601 timestamp
  starts_on: string;  // YYYY-MM-DD
  ends_on: string;    // YYYY-MM-DD
  source_attachment_id: string;
}
