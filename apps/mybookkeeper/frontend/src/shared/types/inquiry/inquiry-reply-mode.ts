/**
 * Discriminated union for what InquiryReplyPanel's body section should
 * render. Replaces a chain of nested ternaries with a single switch.
 *
 * - "reconnect": Gmail is missing, expired, or lacks send scope — show banner
 * - "template":  template tab is active and Gmail is healthy
 * - "custom":    custom tab is active and Gmail is healthy
 */
export type InquiryReplyMode = "reconnect" | "template" | "custom";
