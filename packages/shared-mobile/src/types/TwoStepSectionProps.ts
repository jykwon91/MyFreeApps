import type { ConfirmOwner } from "./ConfirmOwner";
import type { TwoStepStatus } from "./TwoStepStatus";

export interface TwoStepSectionProps {
  /** From useTwoStepStatus, which the screen holds so pull to refresh can reload it. */
  status: TwoStepStatus;
  /** What this app's account holds, since that differs between apps, e.g. "your books". */
  whatItProtects: string;
  confirmOwner: ConfirmOwner;
  onTurnOn: () => void;
}
