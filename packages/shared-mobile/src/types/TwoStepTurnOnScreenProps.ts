import type { TwoStepLeaveRisk } from "./TwoStepLeaveRisk";

export interface TwoStepTurnOnScreenProps {
  appName: string;
  /** Turning on is over, whichever way it went, and this screen can go. */
  onFinished: () => void;
  onLeaveRiskChange: (risk: TwoStepLeaveRisk) => void;
}
