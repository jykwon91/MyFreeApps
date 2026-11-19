import { useState } from "react";

interface LastRows {
  listKey: string;
  rows: readonly unknown[];
  count: number;
}

/**
 * How many times a paged list's rows have come back changed for the filters it already had: a pull to
 * refresh, a poll, a refetch after an edit. Loading the next page only appends rows (RTK Query keeps the
 * rows already loaded as the same objects), so it doesn't count, and neither does a change of filters.
 */
export function useRowsRefreshCount(listKey: string, rows: readonly unknown[]): number {
  const [last, setLast] = useState<LastRows>({ listKey, rows, count: 0 });
  // Kept in state because only a change of rows counts; React re-renders straight away.
  if (rows !== last.rows) {
    const isAppended = rows.length > last.rows.length && last.rows.every((row, i) => rows[i] === row);
    const isRefresh = last.listKey === listKey && !isAppended;
    setLast({ listKey, rows, count: isRefresh ? last.count + 1 : last.count });
  }
  return last.count;
}
