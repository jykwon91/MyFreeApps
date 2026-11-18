import type { StyleProp, ViewStyle } from "react-native";

export interface StaleDataBannerProps {
  /** Whether a refresh failed while the screen still shows what it loaded before. */
  isShown: boolean;
  /**
   * "banner" for a whole screen; "note" for one section of a screen, as a quiet line that isn't
   * announced, so several failing sections don't each interrupt.
   */
  variant?: "banner" | "note";
  /** For an app that words it its own way. Defaults to SHOWING_LAST_LOADED_MESSAGE. */
  message?: string;
  style?: StyleProp<ViewStyle>;
}
