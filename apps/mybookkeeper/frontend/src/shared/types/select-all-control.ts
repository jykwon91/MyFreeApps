/** The header checkbox of a list that pages: ticks every row the filters match, on every page. */
export interface SelectAllControl {
  checked: boolean;
  indeterminate: boolean;
  /** True while the rows of the other pages are being fetched. */
  isLoading: boolean;
  onToggle: () => void;
}
