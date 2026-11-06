/** What the send button does next, for each platform to put in its own words. */
export const REPLY_SEND_ACTION = {
  SEND: "send",
  TRY_AGAIN: "tryAgain",
  CHECK_AGAIN: "checkAgain",
  SEND_AS_NEW: "sendAsNew",
  /** The earlier attempt can't be checked; sending now may email them twice. */
  SEND_ANYWAY: "sendAnyway",
} as const;
