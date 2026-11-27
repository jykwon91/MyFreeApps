import { useRef, useState } from "react";
import { endOfMonth, format, parse, startOfMonth } from "date-fns";
import type { ChartPointer } from "@/shared/types/dashboard/chart-pointer";
import type { DateRange } from "@/shared/types/dashboard/date-range";
import type { MonthDragOverlay } from "@/shared/types/dashboard/month-drag-overlay";

export interface MonthRangeDrag {
  /** Where the drag runs while it's under way, for a highlight; null otherwise. */
  overlay: MonthDragOverlay | null;
  /** True after a drag, so the click that ends it isn't taken as a bar click. */
  wasDragged: () => boolean;
  handlers: {
    onMouseDown: (e: ChartPointer) => void;
    onMouseMove: (e: ChartPointer) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
  };
}

/**
 * Dragging across a month chart picks the months it covers: `onRangeSelect`
 * hears the first day of the first month to the last day of the last.
 * `monthOf` turns an x-axis label into its "yyyy-MM".
 */
export function useMonthRangeDrag(
  monthOf: (label: string) => string | undefined,
  onRangeSelect: (range: DateRange) => void,
): MonthRangeDrag {
  // Drag state lives in a ref so onMouseUp reads it synchronously — React 19
  // automatic batching can otherwise leave onMouseUp seeing stale state from
  // onMouseDown's setState calls, which leaves `dragged` permanently true and
  // silently swallows every bar click.
  const dragRef = useRef<{ start: string | null; end: string | null; dragged: boolean }>({
    start: null,
    end: null,
    dragged: false,
  });
  // Only the highlight needs a re-render.
  const [overlay, setOverlay] = useState<MonthDragOverlay | null>(null);

  function onMouseDown(e: ChartPointer) {
    if (e.activeLabel != null) {
      const label = String(e.activeLabel);
      dragRef.current = { start: label, end: label, dragged: false };
    }
  }

  function onMouseMove(e: ChartPointer) {
    const { start } = dragRef.current;
    if (start && e.activeLabel != null) {
      const label = String(e.activeLabel);
      dragRef.current.end = label;
      if (label !== start) {
        dragRef.current.dragged = true;
        setOverlay({ start, end: label });
      }
    }
  }

  function onMouseUp() {
    const { start, end, dragged } = dragRef.current;
    dragRef.current.start = null;
    dragRef.current.end = null;
    setOverlay(null);
    if (!dragged || !start || !end) return;
    const startMonth = monthOf(start);
    const endMonth = monthOf(end);
    if (!startMonth || !endMonth) return;
    const [first, last] = startMonth <= endMonth ? [startMonth, endMonth] : [endMonth, startMonth];
    onRangeSelect({
      startDate: format(startOfMonth(parse(first, "yyyy-MM", new Date())), "yyyy-MM-dd"),
      endDate: format(endOfMonth(parse(last, "yyyy-MM", new Date())), "yyyy-MM-dd"),
    });
  }

  function onMouseLeave() {
    if (dragRef.current.start) {
      dragRef.current = { start: null, end: null, dragged: false };
      setOverlay(null);
    }
  }

  return {
    overlay,
    wasDragged: () => dragRef.current.dragged,
    handlers: { onMouseDown, onMouseMove, onMouseUp, onMouseLeave },
  };
}
