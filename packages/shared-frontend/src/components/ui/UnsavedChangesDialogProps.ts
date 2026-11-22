import type { DiscardCopy } from "@platform/core/types/discard/discard-copy";

export interface UnsavedChangesDialogProps {
  open: boolean;
  /** The question and its two answers. `DISCARD_MESSAGES` from @platform/core is the usual one. */
  copy: DiscardCopy;
  onKeepEditing: () => void;
  onDiscard: () => void;
  /**
   * Adds a third answer that saves, then closes. Without it, the only answers are
   * Keep editing and Discard.
   */
  save?: {
    label: string;
    loadingLabel: string;
    isSaving: boolean;
    onSave: () => void;
  };
  /** Shown inside the dialog, for example after a failed save. */
  error?: string | null;
}
