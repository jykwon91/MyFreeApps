import type { Href } from "expo-router";

export interface TwoStepTurnOnFlowProps {
  appName: string;
  /** Where to go when it's over and there's nothing to go back to, e.g. after a deep link. */
  securityRoute: Href;
}
