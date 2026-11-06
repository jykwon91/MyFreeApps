/**
 * How an inbox submission shows: a new story to approve, one already handled elsewhere, a vote on an
 * existing public story, or a rejected / unanswered-question submission (collapsed section).
 */
export type InboxCardKind = "new" | "already_handled" | "duplicate" | "rejected";
