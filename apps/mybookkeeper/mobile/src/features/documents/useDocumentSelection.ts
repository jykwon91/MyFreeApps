import { DEFAULT_DOCUMENT_VIEW } from "@mybookkeeper/api-client/constants/documentListView";
import { useLazyListDocumentSelectionQuery } from "@mybookkeeper/api-client/store/documentsApi";
import type { Document } from "@mybookkeeper/api-client/types/document/document";
import type { DocumentPageArgs } from "@mybookkeeper/api-client/types/document/DocumentPageArgs";
import type { DocumentSelectionRef } from "@mybookkeeper/api-client/types/document/DocumentSelectionRef";
import { documentFilterQuery } from "@mybookkeeper/api-client/utils/documentListQuery";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { useToast } from "@platform/mobile";
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react";
import { DOCUMENT_BULK_MESSAGES as MESSAGES } from "../../constants/documentBulk";
import { useRowSelection } from "../../lib/useRowSelection";
import type { DocumentMatches } from "../../types/DocumentMatches";
import type { ListRowsStatus } from "../../types/ListRowsStatus";
import { isActionable, isBeingRead } from "./documentDisplay";

const EVERY_DOCUMENT_KEY = documentFilterQuery(DEFAULT_DOCUMENT_VIEW);

function actionableIds(refs: readonly DocumentSelectionRef[]): string[] {
  return refs.filter(isActionable).map((ref) => ref.id);
}

/**
 * Which documents are ticked while picking several. "Select all" asks the server for every document the
 * search and filters match (GET /documents/selection), so it ticks ones not loaded yet. While picking, the
 * same request tells which ticks the search and filters leave shown, for the count and for Delete; a tick
 * they hide is kept (and noted), but one for a document that is gone or is being read is dropped. That is
 * checked again whenever the list comes back changed; until a check is in, only ticks on loaded rows count,
 * and Delete waits if any other is ticked, so it never reaches a hidden or deleted document.
 */
export function useDocumentSelection(rows: readonly Document[], args: DocumentPageArgs, rowsStatus: ListRowsStatus) {
  const { showToast } = useToast();
  const selection = useRowSelection();
  const { selected, keepOnly, cancel, selectAll: tickAll } = selection;
  const [fetchSelection] = useLazyListDocumentSelectionQuery();
  const [matches, setMatches] = useState<DocumentMatches | null>(null);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const isSelecting = selected !== null;

  const filterKey = useMemo(() => documentFilterQuery(args), [args]);
  const checkKey = `${filterKey}#${rowsStatus.version}`;
  const current = matches?.checkKey === checkKey ? matches.refs : null;

  // The ticks now, for the check below to read without re-running on every tap.
  const readSelected = useEffectEvent(() => selected);

  useEffect(() => {
    if (!isSelecting) return;
    let superseded = false;
    async function check(): Promise<void> {
      const refs = await fetchSelection(args).unwrap();
      if (superseded) return;
      setMatches({ checkKey, refs });
      const shown = new Set(refs.map((ref) => ref.id));
      const unshown = [...(readSelected() ?? [])].filter((id) => !shown.has(id));
      // A tick the filters don't show is hidden or gone: only every document tells the two apart.
      const everyDocument = unshown.length > 0 && filterKey !== EVERY_DOCUMENT_KEY ? await fetchSelection(DEFAULT_DOCUMENT_VIEW).unwrap() : refs;
      if (!superseded) keepOnly(actionableIds(everyDocument));
    }
    check().catch((error: unknown) => {
      if (superseded || isCancelledRequest(error)) return;
      cancel();
      showToast(MESSAGES.checkFailed, "error");
    });
    return () => {
      superseded = true;
    };
  }, [isSelecting, checkKey, filterKey, args, fetchSelection, keepOnly, cancel, showToast]);

  const loadedIds = useMemo(
    () => new Set(rowsStatus.isCurrent ? actionableIds(rows) : []),
    [rows, rowsStatus.isCurrent],
  );
  const shownIds = useMemo(() => (current ? new Set(actionableIds(current)) : loadedIds), [current, loadedIds]);
  const selectedIds = useMemo(() => [...(selected ?? [])].filter((id) => shownIds.has(id)), [selected, shownIds]);
  const ticked = selected?.size ?? 0;
  const isChecking = current === null && ticked > selectedIds.length;

  const selectAll = useCallback(async () => {
    setIsSelectingAll(true);
    try {
      const refs = current ?? (await fetchSelection(args).unwrap());
      setMatches({ checkKey, refs });
      tickAll(actionableIds(refs));
    } catch (error) {
      if (!isCancelledRequest(error)) showToast(MESSAGES.selectAllFailed, "error");
    } finally {
      setIsSelectingAll(false);
    }
  }, [current, fetchSelection, args, checkKey, tickAll, showToast]);

  return {
    ...selection,
    /** The ticks the search and filters leave shown: what the count says and Delete sends. */
    selectedIds,
    /** Ticks the search or filters hide; known once a check is in. */
    hiddenCount: current ? ticked - selectedIds.length : 0,
    /** What Select all would tick, once known. */
    selectableCount: current ? actionableIds(current).length : undefined,
    /** Matching documents still being read, which can't be ticked yet. */
    beingReadCount: (current ?? rows).filter(isBeingRead).length,
    isChecking,
    isSelectingAll,
    selectAll,
  };
}
