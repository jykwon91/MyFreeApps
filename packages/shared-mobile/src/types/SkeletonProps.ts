import type { DimensionValue, StyleProp, ViewStyle } from "react-native";

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}
