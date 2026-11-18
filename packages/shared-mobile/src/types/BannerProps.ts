import type { StyleProp, ViewStyle } from "react-native";
import type { PressHandler } from "./PressHandler";

export interface BannerAction {
  label: string;
  /** What a screen reader says, when the label alone isn't enough. */
  accessibilityHint?: string;
  /** Return the promise for work that takes a while: the action shows a spinner and ignores taps until it settles. */
  onPress: PressHandler;
}

export interface BannerProps {
  /** Screen readers announce it when it appears or changes, on iOS and Android. */
  message: string;
  /** Defaults to `error`. */
  tone?: "error" | "success" | "info";
  actions?: BannerAction[];
  style?: StyleProp<ViewStyle>;
}
