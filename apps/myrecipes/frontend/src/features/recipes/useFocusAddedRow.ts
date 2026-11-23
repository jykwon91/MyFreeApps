import { useEffect, useRef, type RefObject } from "react";

interface AddedRowFocus {
  containerRef: RefObject<HTMLDivElement | null>;
  add: () => void;
}

/**
 * Wraps a list's "Add" action so the new last row's first control takes focus, rather than
 * leaving it on the button. Controls mark themselves with `data-row-first`.
 */
export function useFocusAddedRow(rowCount: number, onAdd: () => void): AddedRowFocus {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAdding = useRef(false);

  useEffect(() => {
    if (!isAdding.current) return;
    isAdding.current = false;
    const firsts = containerRef.current?.querySelectorAll<HTMLElement>("[data-row-first]");
    firsts?.[firsts.length - 1]?.focus();
  }, [rowCount]);

  function add() {
    isAdding.current = true;
    onAdd();
  }

  return { containerRef, add };
}
