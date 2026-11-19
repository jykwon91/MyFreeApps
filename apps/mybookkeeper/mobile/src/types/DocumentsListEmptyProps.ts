export interface DocumentsListEmptyProps {
  /** New filters are loading their first page. */
  isFiltering: boolean;
  loadFailed: boolean;
  onRetry: () => void;
}
