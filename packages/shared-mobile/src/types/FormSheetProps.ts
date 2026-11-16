import type { ReactNode } from "react";
import type { DiscardCopy } from "./DiscardCopy";

export interface FormSheetProps {
  title: string;
  isOpen: boolean;
  /**
   * Really closes the sheet. Back, the system's dismiss and a FormSheetCancelButton come here only
   * once it's safe: straight away with nothing to lose, or after the person agrees to discard.
   * A save that succeeded calls it directly, so it never asks.
   */
  onRequestClose: () => void;
  /** Something typed or chosen that closing would throw away. */
  hasUnsavedChanges?: boolean;
  /** The question asked before unsaved changes go, when the general one doesn't fit (picked files). */
  discardCopy?: DiscardCopy;
  /** A save on its way; the sheet can't be closed until it settles. */
  isBusy?: boolean;
  /** What went wrong, shown at the top where the person will see it. */
  failure?: string | null;
  children: ReactNode;
}
