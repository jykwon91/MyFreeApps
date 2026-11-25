import { useState } from "react";

export interface ShowMore<T> {
  shown: T[];
  remaining: number;
  showMore: () => void;
}

/** The first ``pageSize`` items, and a page more each time ``showMore`` is called. */
export function useShowMore<T>(items: readonly T[], pageSize: number): ShowMore<T> {
  const [limit, setLimit] = useState(pageSize);
  return {
    shown: items.slice(0, limit),
    remaining: Math.max(items.length - limit, 0),
    showMore: () => setLimit((current) => current + pageSize),
  };
}
