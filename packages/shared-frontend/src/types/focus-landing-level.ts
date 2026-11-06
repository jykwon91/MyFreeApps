/** One step from the focused element up to <body>, with its neighbours as they were when captured. */
export interface FocusLandingLevel {
  element: HTMLElement;
  /** Where the focused element sat among the focusable elements of `element` (itself included). */
  indexInLevel: number;
  next: Element | null;
  previous: Element | null;
}
