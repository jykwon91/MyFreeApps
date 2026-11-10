import type { ReactNode } from "react";
import type { WelcomeManualView } from "./WelcomeManualView";

export interface WelcomeManualLoaderProps {
  id: string;
  /** For the screens that change things: a viewer is told, not shown a form that can't save. */
  requireWrite?: boolean;
  /** The screen is on its way out after a delete, so the manual vanishing isn't an error to show. */
  isLeaving?: boolean;
  children: (view: WelcomeManualView) => ReactNode;
}
