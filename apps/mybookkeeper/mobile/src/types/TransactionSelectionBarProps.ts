export interface TransactionSelectionBarProps {
  selectedCount: number;
  approvableCount: number;
  isApproving: boolean;
  isDeleting: boolean;
  onApprove: () => Promise<void>;
  onDelete: () => void;
  onCancel: () => void;
}
