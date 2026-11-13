import type { ReactNode, Ref } from "react";

export interface StandaloneMainProps {
  /** The page or screen shown in place of the app's shell. */
  children: ReactNode;
  /** The scroll container, for a caller that resets its scroll position. */
  ref?: Ref<HTMLElement>;
}
