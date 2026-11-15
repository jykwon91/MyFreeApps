/** The header checkbox of the transactions table: ticks every row the filters match, on every page. */
export interface SelectAllControl {
  checked: boolean;
  indeterminate: boolean;
  /** True while the rows of the other pages are being fetched. */
  isLoading: boolean;
  onToggle: () => void;
}
