import { pruneSelection } from "@mybookkeeper/api-client/utils/pruneSelection";
import { useCallback, useState } from "react";

/** Which rows are ticked while picking several. Null means not picking at all. */
export function useRowSelection() {
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);

  const start = useCallback((id?: string) => setSelected(new Set(id ? [id] : [])), []);
  const cancel = useCallback(() => setSelected(null), []);
  const toggle = useCallback(
    (id: string) =>
      setSelected((current) => {
        if (current === null) return current;
        const next = new Set(current);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    [],
  );
  const selectAll = useCallback((ids: readonly string[]) => setSelected(new Set(ids)), []);
  /** Drops ticks for rows that are gone, so a refreshed or narrowed list never acts on what can't be seen. */
  const keepOnly = useCallback(
    (ids: readonly string[]) => setSelected((current) => (current === null ? current : pruneSelection(current, ids))),
    [],
  );

  return { selected, isSelecting: selected !== null, start, cancel, toggle, selectAll, keepOnly };
}
