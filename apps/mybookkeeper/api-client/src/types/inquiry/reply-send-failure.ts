/** Why a reply send didn't come back with the sent message. */
export type ReplySendFailure =
  | "gmailDisconnected"
  | "gmailConnection"
  | "gmailRejected"
  | "gone"
  | "viewOnly"
  | "noRecipient"
  | "unsure"
  | "notRecorded"
  | "inFlight"
  /** An earlier attempt went through a Gmail account that isn't connected now, so it can't be checked. */
  | "otherAccount"
  | "refused";
