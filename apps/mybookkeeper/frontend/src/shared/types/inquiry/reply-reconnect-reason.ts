/** Why the reply panel asks the host to reconnect Gmail, or null when it doesn't. */
export type ReplyReconnectReason = "missing-integration" | "missing-send-scope" | "reauth-required" | null;
