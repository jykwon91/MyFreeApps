import type { MobileSession } from "./MobileSession";

/** Where an app's data export comes from, and what the downloaded file is called. */
export interface DataExportSource {
  apiBaseUrl: string;
  session: MobileSession;
  /** As the website names the download, e.g. "myrecipes-export". */
  filePrefix: string;
  /**
   * The download's headers, read as it starts, for a backend that needs more than the sign-in,
   * such as MyBookkeeper's workspace. Without it the download sends only the sign-in.
   */
  headers?: () => Record<string, string>;
}
