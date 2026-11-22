import { useGetDuplicatesQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import { useMemo } from "react";

const NO_IDS: ReadonlySet<string> = new Set();

/**
 * The ids of every transaction that sits in a suspected-duplicate pair. This is the same query the Money tab
 * and Home already load, so it is read from their cache rather than fetched again.
 */
export function useDuplicateTransactionIds(): ReadonlySet<string> {
  const { data } = useGetDuplicatesQuery();
  return useMemo(() => {
    if (!data) return NO_IDS;
    const ids = new Set<string>();
    for (const pair of data.pairs) {
      ids.add(pair.transaction_a.id);
      ids.add(pair.transaction_b.id);
    }
    return ids;
  }, [data]);
}
