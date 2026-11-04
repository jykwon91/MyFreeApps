import type { ReactNode } from "react";

export interface ToastProviderProps {
  children: ReactNode;
  /** Distance from the bottom of the screen, clear of the tab bar and the home indicator. */
  bottomOffset: number;
}
