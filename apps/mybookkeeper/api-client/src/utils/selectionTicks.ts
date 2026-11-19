import type { SelectableRef } from "../types/selection/SelectableRef";
import type { SelectionTicks } from "../types/selection/SelectionTicks";

export const NO_TICKS: SelectionTicks<never> = { refs: {}, checkKey: null };

export function tickCount<R extends SelectableRef>(ticks: SelectionTicks<R>): number {
  return Object.keys(ticks.refs).length;
}

/**
 * Ticks rows known to match ``checkKey`` (null when that isn't known). The result is known to
 * match it only if every row already ticked was too.
 */
export function addTicks<R extends SelectableRef>(
  current: SelectionTicks<R>,
  refs: readonly R[],
  checkKey: string | null,
): SelectionTicks<R> {
  const known = tickCount(current) === 0 || current.checkKey === checkKey;
  return {
    refs: { ...current.refs, ...Object.fromEntries(refs.map((ref) => [ref.id, ref])) },
    checkKey: known ? checkKey : null,
  };
}

/** Keeps only the ticked rows among ``matching``: every row that matches as of ``checkKey``. */
export function intersectTicks<R extends SelectableRef>(
  current: SelectionTicks<R>,
  matching: readonly R[],
  checkKey: string,
): SelectionTicks<R> {
  const refs: Record<string, R> = {};
  for (const ref of matching) if (ref.id in current.refs) refs[ref.id] = ref;
  return { refs, checkKey };
}

/** Unticks ``ids``; the rest still match whatever they matched. */
export function removeTicks<R extends SelectableRef>(current: SelectionTicks<R>, ids: readonly string[]): SelectionTicks<R> {
  const dropped = new Set(ids);
  return {
    refs: Object.fromEntries(Object.entries(current.refs).filter(([id]) => !dropped.has(id))),
    checkKey: current.checkKey,
  };
}
