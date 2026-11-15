import { useCallback, useEffect, useMemo, useState } from "react";
import { functionalUpdate, type RowSelectionState, type Updater } from "@tanstack/react-table";
import { useLazyListTransactionSelectionQuery } from "@mybookkeeper/api-client/store/transactionsApi";
import type { Transaction } from "@mybookkeeper/api-client/types/transaction/transaction";
import type { TransactionListParams } from "@mybookkeeper/api-client/types/transaction/TransactionListParams";
import type { TransactionSelectionRef } from "@mybookkeeper/api-client/types/transaction/TransactionSelectionRef";
import { transactionListQuery } from "@mybookkeeper/api-client/utils/transactionListQuery";
import { useToast } from "@/shared/hooks/useToast";
import { SELECT_ALL_FAILED, SELECTION_CHECK_FAILED } from "@/shared/lib/transaction-list-messages";
import { refsById, toSelectionRef } from "@/shared/utils/transaction-selection-ref";
import { addTicks, intersectTicks, NO_TICKS, removeTicks, tickCount } from "@/shared/utils/transaction-ticks";
import type { SelectAllRun } from "@/shared/types/transaction/select-all-run";
import type { TransactionSelection } from "@/shared/types/transaction/transaction-selection";
import type { PageRowsStatus } from "@/shared/types/transaction/page-rows-status";
import type { TransactionTicks } from "@/shared/types/transaction/transaction-ticks";

function toRowSelection(ticks: TransactionTicks): RowSelectionState {
  const state: RowSelectionState = {};
  for (const id of Object.keys(ticks.refs)) state[id] = true;
  return state;
}

/**
 * Ticks survive paging, sorting and page-size changes. When the filters change, or an edit
 * refetches the rows (``rows.version``), the ticks are checked against the rows the filters match
 * (GET /transactions/selection) and any row they now hide, or that is gone, is unticked; bulk
 * actions wait for that check, so they never reach a hidden or deleted row.
 * "Select all" asks the server for every matching row, so it ticks rows on pages not shown.
 * Status and property are read from the freshest copy of a row, so bulk Approve sees approvals made since.
 *
 * ``rows.isCurrent`` is false while the shown rows are being refetched: they may be left over from
 * the previous filters or edits, so a row ticked then is checked too.
 */
export function useTransactionSelection(
  pageRows: readonly Transaction[],
  params: TransactionListParams,
  total: number,
  rows: PageRowsStatus,
): TransactionSelection {
  const { showError } = useToast();
  const [ticks, setTicks] = useState<TransactionTicks>(NO_TICKS);
  const [lastRun, setLastRun] = useState<SelectAllRun | null>(null);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [fetchSelection, { data: fetchedRefs }] = useLazyListTransactionSelectionQuery();

  const selectionParams = useMemo<TransactionListParams>(
    () => ({ ...params, sort_by: undefined, sort_dir: undefined, sort: undefined }),
    [params],
  );
  const filterKey = useMemo(() => transactionListQuery(selectionParams), [selectionParams]);
  const checkKey = `${filterKey}#${rows.version}`;
  const pageRefs = useMemo(() => refsById(pageRows.map(toSelectionRef)), [pageRows]);
  const freshRefs = useMemo(() => refsById(fetchedRefs ?? []), [fetchedRefs]);

  const needsCheck = tickCount(ticks) > 0 && ticks.checkKey !== checkKey;
  // While an edit's refetch is on its way, the ticks may already be out of date: bulk actions wait for it too.
  const isChecking = needsCheck || (tickCount(ticks) > 0 && rows.isRefetching);

  useEffect(() => {
    if (!needsCheck) return;
    let superseded = false;
    fetchSelection(selectionParams)
      .unwrap()
      .then((matching) => {
        if (!superseded) setTicks((current) => intersectTicks(current, matching, checkKey));
      })
      .catch(() => {
        if (superseded) return;
        setTicks(NO_TICKS);
        showError(SELECTION_CHECK_FAILED);
      });
    return () => {
      superseded = true;
    };
  }, [needsCheck, fetchSelection, selectionParams, checkKey, showError]);

  const rowSelection = useMemo(() => toRowSelection(ticks), [ticks]);

  const selectedRefs = useMemo(
    () => Object.values(ticks.refs).map((ref) => pageRefs.get(ref.id) ?? freshRefs.get(ref.id) ?? ref),
    [ticks, pageRefs, freshRefs],
  );

  const onRowSelectionChange = useCallback(
    (updater: Updater<RowSelectionState>) => {
      setTicks((current) => {
        const next = functionalUpdate(updater, toRowSelection(current));
        const unticked = Object.keys(current.refs).filter((id) => !next[id]);
        const ticked: TransactionSelectionRef[] = [];
        for (const [id, isSelected] of Object.entries(next)) {
          const ref = pageRefs.get(id);
          if (isSelected && !(id in current.refs) && ref) ticked.push(ref);
        }
        return addTicks(removeTicks(current, unticked), ticked, rows.isCurrent ? checkKey : null);
      });
    },
    [pageRefs, rows.isCurrent, checkKey],
  );

  const remove = useCallback((ids: readonly string[]) => setTicks((current) => removeTicks(current, ids)), []);

  const clear = useCallback(() => setTicks(NO_TICKS), []);

  const checked =
    total > 0 &&
    lastRun !== null &&
    lastRun.filterKey === filterKey &&
    lastRun.ids.length === total &&
    lastRun.ids.every((id) => id in ticks.refs);
  const indeterminate = !checked && selectedRefs.length > 0;

  const onToggle = useCallback(async () => {
    if (checked && lastRun) {
      remove(lastRun.ids);
      return;
    }
    setIsSelectingAll(true);
    try {
      const refs = await fetchSelection(selectionParams).unwrap();
      setTicks((current) => addTicks(current, refs, checkKey));
      setLastRun({ filterKey, ids: refs.map((ref) => ref.id) });
    } catch {
      showError(SELECT_ALL_FAILED);
    } finally {
      setIsSelectingAll(false);
    }
  }, [checked, lastRun, remove, fetchSelection, selectionParams, filterKey, checkKey, showError]);

  // Stable while nothing changes, so the table's columns aren't rebuilt on every render.
  const selectAll = useMemo(
    () => ({ checked, indeterminate, isLoading: isSelectingAll, onToggle: () => void onToggle() }),
    [checked, indeterminate, isSelectingAll, onToggle],
  );

  return { rowSelection, onRowSelectionChange, selectedRefs, isChecking, selectAll, clear, remove };
}
