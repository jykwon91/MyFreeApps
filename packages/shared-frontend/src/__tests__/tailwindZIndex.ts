/**
 * The z-index an element's Tailwind class sets (`z-50`, `z-[70]`). jsdom applies
 * no stylesheet, so stacking order is read from the class the component renders.
 */
export function tailwindZIndex(element: Element): number {
  const classes = element.getAttribute("class") ?? "";
  const match = classes.match(/(?:^|\s)z-\[?(\d+)\]?(?=\s|$)/);
  if (!match) throw new Error(`No z-index class on <${element.tagName.toLowerCase()} class="${classes}">`);
  return Number(match[1]);
}
