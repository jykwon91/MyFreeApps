export interface ReceiptDismissFailure {
  message: string;
  /** The receipt isn't open anymore, so it leaves the list and nothing went wrong. */
  isFinished: boolean;
}
