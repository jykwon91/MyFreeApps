import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";

export default function UtilityPlanSkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Skeleton height={20} width="65%" />
      <Skeleton height={14} width="50%" />
      <Skeleton height={14} width="55%" />
    </View>
  );
}
