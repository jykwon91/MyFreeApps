import { useState } from "react";
import { DRILL_DOWN_PAGE_SIZE } from "@mybookkeeper/api-client/constants/transactionPaging";

export interface DrillDownPaging<T> {
  visible: T[];
  remaining: number;
  showMore: () => void;
}

/**
 * Pages an already-filtered list. The shown count lives with the caller, so it survives the detail
 * view, and goes back to one page when `resetKey` (the filter) changes.
 */
export function useDrillDownPaging<T>(rows: readonly T[], resetKey: string): DrillDownPaging<T> {
  const [state, setState] = useState({ resetKey, shown: DRILL_DOWN_PAGE_SIZE });
  // Filter changed: start over from the first page (state adjusted during render, no extra pass).
  const shown = state.resetKey === resetKey ? state.shown : DRILL_DOWN_PAGE_SIZE;
  if (state.resetKey !== resetKey) setState({ resetKey, shown });

  return {
    visible: rows.slice(0, shown),
    remaining: Math.max(rows.length - shown, 0),
    showMore: () => setState({ resetKey, shown: shown + DRILL_DOWN_PAGE_SIZE }),
  };
}
