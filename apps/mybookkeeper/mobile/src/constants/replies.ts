export const REPLY_DRAFT_DIRECTORY = "reply-drafts";

/** The first choice in the template list. */
export const WRITE_MY_OWN_OPTION = "write-my-own";

/** Same as the server's limits on a reply. */
export const REPLY_SUBJECT_MAX_LENGTH = 500;
export const REPLY_BODY_MAX_LENGTH = 50000;

export const REPLY_BODY_MIN_HEIGHT = 160;

/** The server records a reply just after Gmail takes it, so a first look can come too soon. */
export const REPLY_CHECK_DELAYS_MS = [0, 2000, 3000];
