/**
 * Mirrors backend ``LeaseExtensionSummary``.
 *
 * Exposed on ``SignedLeaseDetail.latest_extension`` for the lease detail
 * page to offer undoing it.
 */
export interface LeaseExtensionSummary {
  id: string;
  created_at: string; // ISO-8601 timestamp
  starts_on: string;  // YYYY-MM-DD
  ends_on: string;    // YYYY-MM-DD
  source_attachment_id: string;
  /** Where the end date goes back to if this extension is undone. */
  previous_ends_on: string | null; // YYYY-MM-DD
  undo_expires_at: string; // ISO-8601 timestamp
  /** The server owns the 30-day window, so no client works it out from its own clock. */
  can_undo: boolean;
}
