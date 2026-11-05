/** Why a queued receipt can't be sent yet. Matches the server's `ReceiptSendBlocker`. */
export type ReceiptSendBlocker =
  | "not_attributed"
  | "tenant_of_other_member"
  | "tenant_no_email"
  | "no_lease";
