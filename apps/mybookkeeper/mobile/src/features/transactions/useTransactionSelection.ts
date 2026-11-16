import { useLazyListTransactionSelectionQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import type { SelectAllRun } from "@mybookkeeper/api-client/types/transaction/SelectAllRun";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import type { TransactionTicks } from "@mybookkeeper/api-client/types/transaction/TransactionTicks";
import { transactionListQuery } from "@mybookkeeper/api-client/utils/transactionListQuery";
import { refsById, toSelectionRef } from "@mybookkeeper/api-client/utils/transactionSelectionRef";
import { addTicks, intersectTicks, NO_TICKS, removeTicks, tickCount } from "@mybookkeeper/api-client/utils/transactionTicks";
import { useToast } from "@platform/mobile";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TRANSACTION_SELECTION_MESSAGES as MESSAGES } from "../../constants/transactionSelection";
import type { ListRowsStatus } from "../../types/ListRowsStatus";

/**
 * Which transactions are ticked while picking several, as the website keeps them. "Select all" asks the
 * server for every row the filters match (GET /transactions/selection), so it ticks rows not loaded yet.
 * Changing the filters or the order stops picking. When the list is fetched again (a pull to refresh, an
 * edit), the ticks are checked against the rows the filters match and any that's gone or now hidden is
 * unticked; bulk actions wait for that check, so they never reach a hidden or deleted row.
 * Status and property are read from the freshest copy of a row, so Approve sees approvals made since.
 */
export function useTransactionSelection(rows: readonly Transaction[], params: TransactionListParams, rowsStatus: ListRowsStatus) {
  const { showToast } = useToast();
  // Null while not picking at all.
  const [ticks, setTicks] = useState<TransactionTicks | null>(null);
  const [lastRun, setLastRun] = useState<SelectAllRun | null>(null);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [fetchSelection, { data: fetchedRefs }] = useLazyListTransactionSelectionQuery();

  const selectionParams = useMemo<TransactionListParams>(
    () => ({ ...params, sort_by: undefined, sort_dir: undefined, sort: undefined }),
    [params],
  );
  const filterKey = useMemo(() => transactionListQuery(selectionParams), [selectionParams]);
  const listKey = JSON.stringify(params);
  const checkKey = `${filterKey}#${rowsStatus.version}`;

  // Ticks belong to the list they were made in. Cleared while rendering, so no check runs for the old ticks.
  const [ticksListKey, setTicksListKey] = useState(listKey);
  if (ticksListKey !== listKey) {
    setTicksListKey(listKey);
    setTicks(null);
    setLastRun(null);
  }

  const count = ticks ? tickCount(ticks) : 0;
  const needsCheck = ticks !== null && count > 0 && ticks.checkKey !== checkKey;
  const isChecking = needsCheck || (count > 0 && !rowsStatus.isCurrent);

  useEffect(() => {
    if (!needsCheck) return;
    let superseded = false;
    fetchSelection(selectionParams)
      .unwrap()
      .then((matching) => {
        if (!superseded) setTicks((current) => (current === null ? current : intersectTicks(current, matching, checkKey)));
      })
      .catch(() => {
        if (superseded) return;
        setTicks((current) => (current === null ? current : NO_TICKS));
        showToast(MESSAGES.checkFailed, "error");
      });
    return () => {
      superseded = true;
    };
  }, [needsCheck, fetchSelection, selectionParams, checkKey, showToast]);

  const rowRefs = useMemo(() => refsById(rows.map(toSelectionRef)), [rows]);
  const freshRefs = useMemo(() => refsById(fetchedRefs ?? []), [fetchedRefs]);
  const selectedRefs = useMemo(
    () => (ticks ? Object.values(ticks.refs).map((ref) => rowRefs.get(ref.id) ?? freshRefs.get(ref.id) ?? ref) : []),
    [ticks, rowRefs, freshRefs],
  );

  const tickKey = rowsStatus.isCurrent ? checkKey : null;

  const start = useCallback(
    (row?: Transaction) => setTicks(row ? addTicks(NO_TICKS, [toSelectionRef(row)], tickKey) : NO_TICKS),
    [tickKey],
  );

  const toggle = useCallback(
    (row: Transaction) =>
      setTicks((current) => {
        if (current === null) return current;
        return row.id in current.refs ? removeTicks(current, [row.id]) : addTicks(current, [toSelectionRef(row)], tickKey);
      }),
    [tickKey],
  );

  const cancel = useCallback(() => {
    setTicks(null);
    setLastRun(null);
  }, []);

  /** Unticks `ids` and leaves every other tick as it is. */
  const drop = useCallback(
    (ids: readonly string[]) => setTicks((current) => (current === null ? current : removeTicks(current, ids))),
    [],
  );

  const selectAll = useCallback(async () => {
    setIsSelectingAll(true);
    try {
      const refs = await fetchSelection(selectionParams).unwrap();
      setTicks((current) => addTicks(current ?? NO_TICKS, refs, checkKey));
      setLastRun({ filterKey, ids: refs.map((ref) => ref.id) });
    } catch {
      showToast(MESSAGES.selectAllFailed, "error");
    } finally {
      setIsSelectingAll(false);
    }
  }, [fetchSelection, selectionParams, checkKey, filterKey, showToast]);

  const isAllSelected =
    ticks !== null &&
    lastRun !== null &&
    lastRun.filterKey === filterKey &&
    lastRun.ids.length > 0 &&
    lastRun.ids.every((id) => id in ticks.refs);

  const isSelected = useCallback((id: string) => (ticks ? id in ticks.refs : undefined), [ticks]);

  return {
    ticks,
    isSelecting: ticks !== null,
    isSelected,
    selectedRefs,
    isChecking,
    isSelectingAll,
    isAllSelected,
    start,
    toggle,
    cancel,
    drop,
    selectAll,
  };
}
