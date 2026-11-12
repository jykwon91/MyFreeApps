import type { DataExportSource } from "./DataExportSource";
import type { SecurityScreenContent } from "./SecurityScreenContent";

export interface SecurityScreenProps {
  /** Changes when the screen comes back into focus, as turning on two-step sign-in may have changed it. */
  reloadSignal: number;
  content: SecurityScreenContent;
  /** Where the phone remembers the two-step intro was dismissed, as the website keys it per app. */
  introDismissedKey: string;
  dataExport: DataExportSource;
  onTurnOn: () => void;
  onDeleteAccount: () => void;
}
