import type { Href } from "expo-router";

export type MoreMenuItem = {
  label: string;
  adminOnly?: boolean;
} & (
  | {
      /** Where this is on the website, until the app has its own screen. */
      webPath: string;
      /** The app's own screen, once it has one. */
      screen?: Href;
    }
  | { webPath?: undefined; screen: Href }
);
