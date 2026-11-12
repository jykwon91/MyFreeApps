import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

export interface PinnedBarProps {
  children: ReactNode;
  /** The bar's padding above the home indicator; PinnedBar sets paddingBottom, so the style shouldn't. */
  bottomSpacing: number;
  style?: StyleProp<ViewStyle>;
}
