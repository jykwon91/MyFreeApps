import type { ListLoadMode } from "@/shared/types/list-load-mode";

/** What a paged list page's body shows: its mode, and the rows of the current filters only. */
export interface PagedListView<T> {
  mode: ListLoadMode;
  rows: readonly T[];
}
