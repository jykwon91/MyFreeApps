/** How the parts of a FormSheet close it, the same way Back does. */
export interface FormSheetClose {
  /** Closes the sheet, asking first if there are unsaved changes, and not at all while a save is on its way. */
  requestClose: () => void;
  isBusy: boolean;
}
