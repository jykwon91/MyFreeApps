import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export interface LoadingRegionProps {
  children: ReactNode;
  /** What a screen reader says for the whole region; "Loading" unless something more specific fits. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
