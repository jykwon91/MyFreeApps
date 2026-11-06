import type { FocusLandingLevel } from "./focus-landing-level";

/** Captured while `element` still has focus, so focus can land nearby if `element` is later removed. */
export interface FocusLanding {
  element: HTMLElement;
  /** `element` first, then each ancestor below <body>. */
  levels: readonly FocusLandingLevel[];
}
