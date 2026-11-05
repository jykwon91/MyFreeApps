/** Whether Gmail can send receipts right now. Matches the server's `ReceiptGmailState`. */
export type ReceiptGmailState = "ready" | "not_connected" | "needs_send_permission" | "needs_reconnect";
