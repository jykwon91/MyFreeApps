export interface SingleCopyScreensSuite {
  /** The app's SINGLE_COPY_SCREENS. */
  screens: readonly string[];
  /** Loads a screen file, with a require path that stays relative to the app. */
  loadScreen: (name: string) => { default?: unknown };
  /** Two links to the same screen with different ids, for an app that has one. */
  distinctPair?: readonly [`/${string}`, `/${string}`];
}
