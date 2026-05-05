/**
 * Discriminated union for what InquirySpamTriagePanel's audit trail should
 * render. Replaces a chain of nested ternaries with a single switch.
 */
export type InquiryAuditTrailMode = "collapsed" | "loading" | "empty" | "list";
