/**
 * Highlight style for Radix menu items (DropdownMenu Item / CheckboxItem /
 * RadioItem). Radix sets `data-highlighted` on the item that has keyboard
 * focus or the pointer over it, so one class covers arrow-key navigation and
 * hover. The inset ring keeps the indicator visible inside clipped popovers.
 */
export const MENU_ITEM_FOCUS_CLASS =
  "outline-none data-[highlighted]:bg-muted data-[highlighted]:ring-2 data-[highlighted]:ring-inset data-[highlighted]:ring-primary";

/** Keyboard focus ring for plain inputs/buttons that suppress the browser outline. */
export const FOCUS_RING_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
