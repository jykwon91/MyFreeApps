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
  | "refused";
