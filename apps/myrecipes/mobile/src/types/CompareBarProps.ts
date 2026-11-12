export interface CompareBarProps {
  isComparing: boolean;
  pickedCount: number;
  onStart: () => void;
  onCancel: () => void;
  onCompare: () => void;
}
