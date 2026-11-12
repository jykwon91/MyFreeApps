import type { MobileSession } from "./MobileSession";

/** Where an app's data export comes from, and what the downloaded file is called. */
export interface DataExportSource {
  apiBaseUrl: string;
  session: MobileSession;
  /** As the website names the download, e.g. "myrecipes-export". */
  filePrefix: string;
}
