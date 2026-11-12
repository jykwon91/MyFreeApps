import type { WebPath } from "./WebPath";

export interface ComingToAppScreenProps {
  title: string;
  /** Where this is on the website, until the app has its own screen. */
  webPath: WebPath;
  webBaseUrl: string;
}
