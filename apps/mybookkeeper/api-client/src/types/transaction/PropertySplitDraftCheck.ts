/** Whether a split being edited can be saved, and how far its shares are from the total. */
export interface PropertySplitDraftCheck {
  includedCount: number;
  /** The ticked shares that read as money, added up. */
  assignedCents: number;
  /** Total minus assigned: positive is still to assign, negative is too much. */
  remainingCents: number;
  /** A ticked share that is blank, unreadable, or not more than zero. */
  hasBadShare: boolean;
  canSave: boolean;
}
