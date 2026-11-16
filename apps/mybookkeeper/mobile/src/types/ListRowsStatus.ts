/** Where the loaded transaction rows stand, for deciding when the ticks need checking. */
export interface ListRowsStatus {
  /** False while the list is being fetched again (not just the next page): the rows may be out of date. */
  isCurrent: boolean;
  /** How many times the list has been fetched again for the same filters; each one means the ticks are checked again. */
  version: number;
}
