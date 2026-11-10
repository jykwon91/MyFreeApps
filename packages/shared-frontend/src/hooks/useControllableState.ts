import { useState } from "react";
import type { StateUpdater } from "../types/state-updater";
import type { UseControllableStateOptions } from "../types/use-controllable-state-options";

/**
 * State that a parent may control. When `value` is passed the parent owns it and
 * `onChange` is the only way it moves; when it's omitted the hook keeps it,
 * starting at `defaultValue`, and still reports each change to `onChange`.
 */
export function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: UseControllableStateOptions<T>): [T, (updater: StateUpdater<T>) => void] {
  const [uncontrolledValue, setUncontrolledValue] = useState<T>(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : uncontrolledValue;

  function setValue(updater: StateUpdater<T>): void {
    const next = updater instanceof Function ? updater(current) : updater;
    if (!isControlled) setUncontrolledValue(next);
    onChange?.(next);
  }

  return [current, setValue];
}
