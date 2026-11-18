export interface TaxRecalculateControlProps {
  isAdmin: boolean;
  needsRecompute: boolean;
  disabled: boolean;
  isRecalculating: boolean;
  onRecalculate: () => void;
}
