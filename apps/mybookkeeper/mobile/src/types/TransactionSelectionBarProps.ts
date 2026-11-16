export interface TransactionSelectionBarProps {
  selectedCount: number;
  approvableCount: number;
  isApproving: boolean;
  isDeleting: boolean;
  /** The ticks are being checked after the list refreshed: the count isn't final, so nothing can run yet. */
  isChecking: boolean;
  onApprove: () => Promise<void>;
  onDelete: () => void;
  onCancel: () => void;
}
