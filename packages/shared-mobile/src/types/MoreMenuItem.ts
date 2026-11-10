import type { Href } from "expo-router";
import type { WebPath } from "./WebPath";

export type MoreMenuItem = { label: string } & (
  | {
      /** Where this is on the website, until the app has its own screen. */
      webPath: WebPath;
      /** The app's own screen, once it has one. */
      screen?: Href;
    }
  | { webPath?: undefined; screen: Href }
);
