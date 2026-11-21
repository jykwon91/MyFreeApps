import { INTERACTIVE_ELEMENT_SELECTOR } from "../constants/interactive-element-selector";

/**
 * In development, reports a control rendered inside another control (a link
 * or button inside a row's primary button), which screen readers can't reach.
 */
export function warnNestedControl(control: Element | null): void {
  if (!import.meta.env.DEV || control === null) return;
  const nested = control.querySelector(INTERACTIVE_ELEMENT_SELECTOR);
  if (nested !== null) {
    console.error("RowPrimaryAction: its content holds another control, and controls can't nest:", nested);
  }
}
