import type { TwoStepTurnOffSettled } from "./TwoStepTurnOffSettled";

export interface TwoStepTurnOffSheetProps {
  onClose: () => void;
  /** Called once the sheet should close. */
  onSettled: (result: TwoStepTurnOffSettled) => void;
}
