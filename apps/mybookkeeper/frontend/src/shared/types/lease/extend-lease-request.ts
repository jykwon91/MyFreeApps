/**
 * Body for POST /signed-leases/{lease_id}/extend.
 *
 * Mirrors backend ``ExtendLeaseRequest``. ``new_ends_on`` is required and
 * must be strictly after the lease's current ``ends_on`` (the backend
 * enforces this and surfaces 409 ``NEW_END_DATE_NOT_AFTER_CURRENT``).
 * ``notes`` is optional free-text (max 2000 chars) that lands on the
 * rendered addendum. ``email_tenant`` triggers a best-effort tenant email
 * after the DB commit.
 */
export interface ExtendLeaseRequest {
  new_ends_on: string; // ISO-8601 YYYY-MM-DD
  notes?: string;
  email_tenant?: boolean;
}
