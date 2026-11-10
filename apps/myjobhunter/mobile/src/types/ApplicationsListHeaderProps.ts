export interface ApplicationsListHeaderProps {
  /** A refresh failed, so the list is what was last loaded. */
  isStale: boolean;
  /** Add and Sort only make sense once there are rows; the empty state offers its own Add. */
  hasRows: boolean;
  sortLabel: string;
  onAdd: () => void;
  onSort: () => void;
}
