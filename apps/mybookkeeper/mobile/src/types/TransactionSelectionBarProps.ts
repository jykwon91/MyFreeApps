export interface TransactionSelectionBarProps {
  selectedCount: number;
  approvableCount: number;
  isApproving: boolean;
  isDeleting: boolean;
  isMarking: boolean;
  isUnmarking: boolean;
  /** The ticks are being checked after the list refreshed: the count isn't final, so nothing can run yet. */
  isChecking: boolean;
  onApprove: () => Promise<void>;
  onMarkCapital: () => Promise<void>;
  onUnmarkCapital: () => Promise<void>;
  onDelete: () => void;
  onCancel: () => void;
}
