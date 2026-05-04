/**
 * Identifies which document the user is currently viewing in a modal.
 * Used by callers (e.g. TenantPayments) that need to remember both the
 * Document id (to fetch the source blob) and the Transaction id (to render
 * the structured payment card from the Transaction's extracted fields).
 */
export interface DocumentViewTarget {
  documentId: string;
  transactionId: string;
}
