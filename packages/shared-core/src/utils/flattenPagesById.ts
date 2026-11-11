import type { PageOfItems } from "../types/paging/page-of-items";

/**
 * Every loaded page as one list, in order. A row added or removed between page
 * loads shifts the offsets, so one can arrive twice; it is kept where it first appeared.
 */
export function flattenPagesById<T extends { id: string }>(pages: readonly PageOfItems<T>[] | undefined): T[] {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const page of pages ?? []) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      rows.push(item);
    }
  }
  return rows;
}
