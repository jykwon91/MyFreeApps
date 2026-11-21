import { INTERACTIVE_ELEMENT_SELECTOR } from "../constants/interactive-element-selector";

/**
 * Whether a click on `container` landed on the container itself rather than on
 * a control inside it (a button, link, checkbox, ...) or on something portalled
 * out of it (a dropdown menu), whose clicks still bubble through React.
 */
export function isOwnClick(target: EventTarget | null, container: Element): boolean {
  if (!(target instanceof Element) || !container.contains(target)) return false;
  const control = target.closest(INTERACTIVE_ELEMENT_SELECTOR);
  return control === null || !container.contains(control);
}
