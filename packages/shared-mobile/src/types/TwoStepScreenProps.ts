import type { ConfirmOwner } from "./ConfirmOwner";
import type { WebPath } from "./WebPath";

export interface TwoStepScreenProps {
  /** What this app's account holds, since that differs between apps, e.g. "your books". */
  whatItProtects: string;
  webBaseUrl: string;
  /** The website's own two-step page, such as "/security". */
  webPath: WebPath;
  confirmOwner: ConfirmOwner;
  onTurnOn: () => void;
  /** Change it to reload, e.g. on coming back from turning it on. */
  reloadSignal?: number;
}
