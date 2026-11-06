/** Lets a parent ask an embedded TransactionPanel to close, so unsaved edits get the same prompt. */
export interface TransactionPanelHandle {
  /** Runs `afterClose` now, or once the user discards or saves their unsaved edits. */
  requestClose: (afterClose: () => void) => void;
}
