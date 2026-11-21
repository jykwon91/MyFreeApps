/**
 * What a column header needs from a TanStack column to be sortable. Any table's
 * column satisfies it, whatever feature set that table registered.
 */
export interface SortableColumn {
  getCanSort: () => boolean;
  getIsSorted: () => false | "asc" | "desc";
  getToggleSortingHandler: () => ((event: unknown) => void) | undefined;
}
