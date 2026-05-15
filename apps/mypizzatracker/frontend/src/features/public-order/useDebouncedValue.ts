import { useEffect, useState } from "react";

/**
 * Debounce a value: returns the latest input after ``delayMs`` of quiet.
 * Used by the public order page so the phone-keyed "the usual" lookup
 * doesn't fire on every keystroke while the customer is typing.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
