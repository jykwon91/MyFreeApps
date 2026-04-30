/**
 * Spam triage state for an inquiry. Mirrors backend ``INQUIRY_SPAM_STATUSES``
 * in ``app/core/inquiry_enums.py``.
 *
 * - ``unscored`` — Gmail-parsed inquiries / pre-T0 / Claude scoring degraded
 * - ``clean`` — passed every gate; operator notified normally
 * - ``flagged`` — borderline Claude score; operator notified with [FLAGGED]
 * - ``spam`` — failed honeypot, disposable email, or scored below threshold
 * - ``manually_cleared`` — operator overrode triage from the inbox
 */
export type InquirySpamStatus =
  | "unscored"
  | "clean"
  | "flagged"
  | "spam"
  | "manually_cleared";
