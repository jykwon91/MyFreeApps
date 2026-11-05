import type { ConfirmOwner } from "./ConfirmOwner";

export interface TwoStepScreenProps {
  /** What this app's account holds, since that differs between apps, e.g. "your books". */
  whatItProtects: string;
  websiteUrl: string;
  confirmOwner: ConfirmOwner;
  onTurnOn: () => void;
  /** Change it to reload, e.g. on coming back from turning it on. */
  reloadSignal?: number;
}
