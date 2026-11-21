import type { MouseEvent } from "react";

/** Keeps a click on a row's own control from also reaching the row's click handler. */
export function stopRowClick(event: MouseEvent): void {
  event.stopPropagation();
}
