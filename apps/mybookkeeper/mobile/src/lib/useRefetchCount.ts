import { useState } from "react";

interface LastFulfilled {
  listKey: string;
  stamp: number | undefined;
  pageCount: number;
  count: number;
}

/**
 * How many times an infinite list has been answered again for the filters it already had: a pull
 * to refresh, or a refetch after an edit. Loading the next page grows the page count, so it doesn't
 * count, and neither does a change of filters. `stamp` is the query's fulfilledTimeStamp.
 */
export function useRefetchCount(listKey: string, stamp: number | undefined, pageCount: number): number {
  const [last, setLast] = useState<LastFulfilled>({ listKey: "", stamp: undefined, pageCount: 0, count: 0 });
  // Kept in state because only a change of stamp counts; React re-renders straight away.
  if (stamp !== undefined && stamp !== last.stamp) {
    const isRefetch = last.listKey === listKey && pageCount <= last.pageCount;
    setLast({ listKey, stamp, pageCount, count: isRefetch ? last.count + 1 : last.count });
  }
  return last.count;
}
