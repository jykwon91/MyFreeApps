import { useEffect, useState } from "react";

/**
 * Returns a copy of `value` that only updates after `delayMs` passes without a
 * further change, so a lookup driven by typing doesn't fire on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
