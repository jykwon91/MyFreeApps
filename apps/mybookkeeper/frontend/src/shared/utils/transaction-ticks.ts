import type { TransactionSelectionRef } from "@mybookkeeper/api-client/types/transaction/TransactionSelectionRef";
import type { TransactionTicks } from "@/shared/types/transaction/transaction-ticks";

export const NO_TICKS: TransactionTicks = { refs: {}, checkKey: null };

export function tickCount(ticks: TransactionTicks): number {
  return Object.keys(ticks.refs).length;
}

/**
 * Ticks rows known to match ``checkKey`` (null when that isn't known). The result is known to
 * match it only if every row already ticked was too.
 */
export function addTicks(
  current: TransactionTicks,
  refs: readonly TransactionSelectionRef[],
  checkKey: string | null,
): TransactionTicks {
  const known = tickCount(current) === 0 || current.checkKey === checkKey;
  return {
    refs: { ...current.refs, ...Object.fromEntries(refs.map((ref) => [ref.id, ref])) },
    checkKey: known ? checkKey : null,
  };
}

/** Keeps only the ticked rows among ``matching``: every row that matches as of ``checkKey``. */
export function intersectTicks(
  current: TransactionTicks,
  matching: readonly TransactionSelectionRef[],
  checkKey: string,
): TransactionTicks {
  const refs: Record<string, TransactionSelectionRef> = {};
  for (const ref of matching) if (ref.id in current.refs) refs[ref.id] = ref;
  return { refs, checkKey };
}

/** Unticks ``ids``; the rest still match whatever they matched. */
export function removeTicks(current: TransactionTicks, ids: readonly string[]): TransactionTicks {
  const dropped = new Set(ids);
  return {
    refs: Object.fromEntries(Object.entries(current.refs).filter(([id]) => !dropped.has(id))),
    checkKey: current.checkKey,
  };
}
