import type { ReactNode } from "react";

export interface SheetModalProps {
  isOpen: boolean;
  /**
   * Asks to close. Back, the system's dismiss and the screen reader's escape gesture (VoiceOver's two-finger
   * scrub) all come here, so a sheet that guards its Cancel button guards each of them the same way.
   */
  onRequestClose: () => void;
  /** Called once the sheet has finished closing, such as to let go of what it was showing. */
  onClosed?: () => void;
  /** Set on the Modal, so a test can send it the system's dismiss (Android Back). */
  testID?: string;
  children: ReactNode;
}
