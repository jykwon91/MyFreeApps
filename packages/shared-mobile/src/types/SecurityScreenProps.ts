import type { DataExportSource } from "./DataExportSource";
import type { DisplayNameSource } from "./DisplayNameSource";
import type { SecurityScreenContent } from "./SecurityScreenContent";

export interface SecurityScreenProps {
  /** Changes when the screen comes back into focus, as turning on two-step sign-in may have changed it. */
  reloadSignal: number;
  content: SecurityScreenContent;
  /** Where the phone remembers the two-step intro was dismissed, as the website keys it per app. */
  introDismissedKey: string;
  /**
   * Reads and saves the display name. Defaults to the shared `display_name`; an app whose backend
   * names it differently passes its own hook. It must stay the same for as long as the screen is open.
   */
  useDisplayName?: () => DisplayNameSource;
  dataExport: DataExportSource;
  onTurnOn: () => void;
  onDeleteAccount: () => void;
}
