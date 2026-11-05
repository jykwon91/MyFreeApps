/** What a refused send means for the screen. */
export type ReceiptSendFailure =
  /** Nothing is left to send: say why and go back. */
  | { kind: "finished"; message: string }
  /** The list knows why better than the server's sentence: reload it, then explain. */
  | { kind: "recheck"; fallback: string }
  /** No answer: it may have gone, so look before saying anything. */
  | { kind: "unsure" }
  | { kind: "message"; message: string };
