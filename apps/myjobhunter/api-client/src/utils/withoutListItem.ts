import type { IdListResponse } from "../types/id-list-response";

/** The list with one record taken out and its total lowered to match. Unchanged when the record isn't there. */
export function withoutListItem<List extends IdListResponse<{ id: string }>>(list: List, id: string): List {
  if (!list.items.some((item) => item.id === id)) return list;
  return { ...list, items: list.items.filter((item) => item.id !== id), total: Math.max(0, list.total - 1) };
}
