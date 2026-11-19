import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

/** One document row's worth of skeleton: its name and the line under it. */
export default function DocumentSkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Skeleton height={20} />
      <Skeleton height={14} />
    </View>
  );
}
