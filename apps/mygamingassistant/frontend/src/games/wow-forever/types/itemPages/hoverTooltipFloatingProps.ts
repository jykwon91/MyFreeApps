import type { FocusEvent, PointerEvent } from "react";

/** What an interactive hover tooltip's floating element must spread (empty for a plain one). */
export interface HoverTooltipFloatingProps {
  tabIndex?: number;
  onPointerEnter?: (event: PointerEvent) => void;
  onPointerLeave?: (event: PointerEvent) => void;
  onBlur?: (event: FocusEvent) => void;
}
