export interface AfterSheetCloses {
  /** Closes the sheet, then runs `action` once it has gone. */
  closeThen: (action: () => void) => void;
  /** The sheet's `onClosed`. */
  handleClosed: () => void;
}
