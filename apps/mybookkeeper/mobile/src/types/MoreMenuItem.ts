export interface MoreMenuItem {
  label: string;
  /** Where this is on the website, until the app has its own screen. */
  webPath: string;
  adminOnly?: boolean;
}
