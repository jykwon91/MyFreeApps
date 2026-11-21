/**
 * Elements that handle their own clicks. A click that starts inside one of
 * these belongs to that control, not to the clickable row or bar around it.
 */
export const INTERACTIVE_ELEMENT_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "summary",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[role='checkbox']",
  "[role='switch']",
  "[role='menu']",
  "[role='listbox']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='option']",
  "[role='tab']",
  "[data-radix-collection-item]",
].join(", ");
