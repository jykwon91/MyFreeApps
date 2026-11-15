/** Where the shown page of transactions stands, for deciding when the ticks need checking. */
export interface PageRowsStatus {
  /** False while any fetch is on its way: the shown rows may be left over from other filters or an edit. */
  isCurrent: boolean;
  /** True while the same page is being fetched again, e.g. after an edit. */
  isRefetching: boolean;
  /** How many times the same page has been fetched again; each one means the ticks are checked again. */
  version: number;
}
