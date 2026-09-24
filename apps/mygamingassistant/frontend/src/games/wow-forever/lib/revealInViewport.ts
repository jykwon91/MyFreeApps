/**
 * Bring an element into view only when it isn't already — e.g. the map on
 * the stacked (narrow) layout, where the results list sits above it and a
 * row click would otherwise zoom a map the user can't see. On the
 * side-by-side layout the map is already on screen and nothing moves.
 */

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True when the element's whole height is inside the window. */
export function isFullyInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const viewport = window.innerHeight || document.documentElement.clientHeight;
  return rect.top >= 0 && rect.bottom <= viewport;
}

/** The scroll behaviour that respects the reader's motion preference. */
export function scrollBehavior(): ScrollBehavior {
  if (prefersReducedMotion()) return "auto";
  return "smooth";
}

export function revealInViewport(el: Element | null): void {
  if (!el || isFullyInViewport(el)) return;
  el.scrollIntoView?.({ block: "nearest", behavior: scrollBehavior() });
}
