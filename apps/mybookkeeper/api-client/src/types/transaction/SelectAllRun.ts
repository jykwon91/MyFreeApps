/** The rows the last "select all" ticked, and the filters it ticked them for. */
export interface SelectAllRun {
  filterKey: string;
  ids: readonly string[];
}
