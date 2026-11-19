import { useCallback, useEffect, useMemo, useState } from "react";
import { functionalUpdate, type RowSelectionState, type Updater } from "@tanstack/react-table";
import { useLazyListDocumentSelectionQuery } from "@mybookkeeper/api-client/store/documentsApi";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import type { DocumentPageArgs } from "@mybookkeeper/api-client/types/document/DocumentPageArgs";
import type { DocumentSelectionRef } from "@mybookkeeper/api-client/types/document/DocumentSelectionRef";
import type { SelectAllRun } from "@mybookkeeper/api-client/types/selection/SelectAllRun";
import type { SelectionTicks } from "@mybookkeeper/api-client/types/selection/SelectionTicks";
import { documentFilterQuery } from "@mybookkeeper/api-client/utils/documentListQuery";
import { toDocumentSelectionRef } from "@mybookkeeper/api-client/utils/documentSelectionRef";
import { addTicks, intersectTicks, NO_TICKS, removeTicks, tickCount } from "@mybookkeeper/api-client/utils/selectionTicks";
import { useToast } from "@/shared/hooks/useToast";
import { DOCUMENT_SELECTION_CHECK_FAILED, SELECT_ALL_DOCUMENTS_FAILED } from "@/shared/lib/document-list-messages";
import type { DocumentSelection } from "@/shared/types/document/document-selection";

type Ticks = SelectionTicks<DocumentSelectionRef>;

function toRowSelection(ticks: Ticks): RowSelectionState {
  return Object.fromEntries(Object.keys(ticks.refs).map((id) => [id, true]));
}

/**
 * Ticks survive "Load more" and re-sorting. When the filters change the ticks are checked against the
 * documents they match (GET /documents/selection) and any they now hide, or that are gone, are unticked;
 * bulk actions wait for that check, so they never reach a hidden document. "Select all" asks the server
 * for every matching document, so it ticks ones not loaded yet.
 *
 * ``isCurrent`` is false while new filters load their first page: a row ticked then
 * may be left over from the old ones, so it is checked too.
 */
export function useDocumentSelection(
  loaded: readonly Document[],
  args: DocumentPageArgs,
  total: number,
  isCurrent: boolean,
): DocumentSelection {
  const { showError } = useToast();
  const [ticks, setTicks] = useState<Ticks>(NO_TICKS);
  const [lastRun, setLastRun] = useState<SelectAllRun | null>(null);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [fetchSelection] = useLazyListDocumentSelectionQuery();

  const filterKey = useMemo(() => documentFilterQuery(args), [args]);
  const loadedRefs = useMemo(() => new Map(loaded.map((row) => [row.id, toDocumentSelectionRef(row)])), [loaded]);

  const needsCheck = tickCount(ticks) > 0 && ticks.checkKey !== filterKey;

  useEffect(() => {
    if (!needsCheck) return;
    let superseded = false;
    fetchSelection(args)
      .unwrap()
      .then((matching) => {
        if (!superseded) setTicks((current) => intersectTicks(current, matching, filterKey));
      })
      .catch(() => {
        if (superseded) return;
        setTicks(NO_TICKS);
        showError(DOCUMENT_SELECTION_CHECK_FAILED);
      });
    return () => {
      superseded = true;
    };
  }, [needsCheck, fetchSelection, args, filterKey, showError]);

  const rowSelection = useMemo(() => toRowSelection(ticks), [ticks]);
  const selectedIds = useMemo(() => Object.keys(ticks.refs), [ticks]);

  const onRowSelectionChange = useCallback(
    (updater: Updater<RowSelectionState>) => {
      setTicks((current) => {
        const next = functionalUpdate(updater, toRowSelection(current));
        const unticked = Object.keys(current.refs).filter((id) => !next[id]);
        const ticked: DocumentSelectionRef[] = [];
        for (const [id, isSelected] of Object.entries(next)) {
          const ref = loadedRefs.get(id);
          if (isSelected && !(id in current.refs) && ref) ticked.push(ref);
        }
        return addTicks(removeTicks(current, unticked), ticked, isCurrent ? filterKey : null);
      });
    },
    [loadedRefs, isCurrent, filterKey],
  );

  const keepOnly = useCallback(
    (ids: readonly string[]) => {
      const kept = new Set(ids);
      setTicks((current) => removeTicks(current, Object.keys(current.refs).filter((id) => !kept.has(id))));
    },
    [],
  );

  const clear = useCallback(() => setTicks(NO_TICKS), []);

  const checked =
    total > 0 &&
    lastRun !== null &&
    lastRun.filterKey === filterKey &&
    lastRun.ids.length === total &&
    lastRun.ids.every((id) => id in ticks.refs);
  const indeterminate = !checked && selectedIds.length > 0;

  const onToggle = useCallback(async () => {
    if (checked && lastRun) {
      setTicks((current) => removeTicks(current, lastRun.ids));
      return;
    }
    setIsSelectingAll(true);
    try {
      const refs = await fetchSelection(args).unwrap();
      setTicks((current) => addTicks(current, refs, filterKey));
      setLastRun({ filterKey, ids: refs.map((ref) => ref.id) });
    } catch {
      showError(SELECT_ALL_DOCUMENTS_FAILED);
    } finally {
      setIsSelectingAll(false);
    }
  }, [checked, lastRun, fetchSelection, args, filterKey, showError]);

  // Stable while nothing changes, so the table's columns aren't rebuilt on every render.
  const selectAll = useMemo(
    () => ({ checked, indeterminate, isLoading: isSelectingAll, onToggle: () => void onToggle() }),
    [checked, indeterminate, isSelectingAll, onToggle],
  );

  return { rowSelection, onRowSelectionChange, selectedIds, isChecking: needsCheck, selectAll, keepOnly, clear };
}
