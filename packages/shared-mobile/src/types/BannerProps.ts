import type { StyleProp, ViewStyle } from "react-native";

export interface BannerAction {
  label: string;
  /** What a screen reader says, when the label alone isn't enough. */
  accessibilityHint?: string;
  onPress: () => void;
}

export interface BannerProps {
  /** Screen readers announce it when it appears or changes, on iOS and Android. */
  message: string;
  actions?: BannerAction[];
  style?: StyleProp<ViewStyle>;
}
