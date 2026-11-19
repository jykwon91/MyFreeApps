import type { ListLoadMode } from "@/shared/types/list-load-mode";

/** A list body's modes by name, so a component switches on constants rather than bare strings. */
export const LIST_LOAD_MODE = {
  loading: "loading",
  error: "error",
  empty: "empty",
  list: "list",
} as const satisfies Record<ListLoadMode, ListLoadMode>;
