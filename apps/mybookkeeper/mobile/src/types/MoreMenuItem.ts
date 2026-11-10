import type { Href } from "expo-router";
import type { MoreMenuAccess } from "./MoreMenuAccess";

export type MoreMenuItem = {
  label: string;
  /** Leave out for everyone; "admin" for owners and admins; "write" for anyone who can change things. */
  access?: MoreMenuAccess;
  /** Other words people look for this by, matched by the All screen's search. */
  keywords?: readonly string[];
} & (
  | {
      /** Where this is on the website, until the app has its own screen. */
      webPath: string;
      /** The app's own screen, once it has one. */
      screen?: Href;
    }
  | { webPath?: undefined; screen: Href }
);
