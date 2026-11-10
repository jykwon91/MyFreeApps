import { useLayoutEffect, useReducer, useRef, useState } from "react";
import type { StateUpdater } from "../types/state-updater";
import type { UseControllableStateOptions } from "../types/use-controllable-state-options";

/**
 * State that a parent may control. When `value` is passed the parent owns it and
 * `onChange` is the only way it moves; when it's omitted the hook keeps it,
 * starting at `defaultValue`, and still reports each change to `onChange`.
 * See UseControllableStateOptions for what happens when the mode switches.
 */
export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: UseControllableStateOptions<T>): [T, (updater: StateUpdater<T>) => void] {
  const [uncontrolledValue, setUncontrolledValue] = useState<T>(defaultValue);
  const [previousValue, setPreviousValue] = useState<T | undefined>(value);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // Controlled → uncontrolled: carry on from the last controlled value. Setting
  // state during render is React's pattern for reacting to a prop change; React
  // re-renders straight away, before anything is committed.
  if (!Object.is(previousValue, value)) {
    setPreviousValue(value);
    if (value === undefined && previousValue !== undefined) {
      setUncontrolledValue(previousValue);
    }
  }

  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolledValue;

  // The value the next update builds on. setValue moves it ahead at once, so two
  // functional updates in one event chain (the second sees the first's result).
  // After each commit it snaps back to what actually rendered: a controlled
  // update always re-renders, so if the parent didn't apply it, the next event
  // builds on the parent's value again rather than on the dropped one.
  const latestRef = useRef<T>(current);
  useLayoutEffect(() => {
    latestRef.current = current;
  });

  function setValue(updater: StateUpdater<T>): void {
    const prev = latestRef.current;
    const next = updater instanceof Function ? updater(prev) : updater;
    if (Object.is(next, prev)) return;
    latestRef.current = next;
    if (isControlled) rerender();
    else setUncontrolledValue(next);
    onChange?.(next);
  }

  return [current, setValue];
}
