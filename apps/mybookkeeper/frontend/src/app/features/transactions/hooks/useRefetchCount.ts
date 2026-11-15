import { useState } from "react";

interface LastFulfilled {
  argsKey: string;
  stamp: number | undefined;
  count: number;
}

/**
 * How many times a query has been answered again for the args it already had: a refetch after an
 * edit (tag invalidation) or a return to the page, not a new page, filter or order. ``stamp`` is
 * the query's fulfilledTimeStamp, passed only while its data is for ``argsKey``.
 */
export function useRefetchCount(argsKey: string, stamp: number | undefined): number {
  const [last, setLast] = useState<LastFulfilled>({ argsKey: "", stamp: undefined, count: 0 });
  // Kept in state because only a change of stamp counts; React re-renders straight away.
  if (stamp !== undefined && stamp !== last.stamp) {
    setLast({ argsKey, stamp, count: last.argsKey === argsKey ? last.count + 1 : last.count });
  }
  return last.count;
}
