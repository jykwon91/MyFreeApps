import type { ImageProps } from "react-native";

/** Everything an Image takes, except how it is resized: a thumbnail always downsamples. */
export type ThumbnailProps = Omit<ImageProps, "resizeMethod"> & {
  /**
   * What the box says when the picture can't be loaded (offline, or a signed link that has expired).
   * Without it a failed photo stays a blank box, so give it for every remote photo.
   */
  failedMessage?: string;
  /** Asks the screen for fresh links, e.g. by refetching the query the photo came from. Needs `failedMessage`. */
  onRetry?: () => void;
  /** Names the retry button for VoiceOver. Defaults to the failed message plus "Tap to try again". */
  retryLabel?: string;
  /** Colours of the failure tile, for photos shown on a fixed backdrop instead of the theme's. */
  failedColors?: { text: string; background: string };
  /** Keeps the failure tile to an accessibility label for boxes too small to hold readable text. */
  hideFailedText?: boolean;
  /** Tells a parent that groups the photo into one control (so it can say the photo didn't load). */
  onFailedChange?: (hasFailed: boolean) => void;
};
