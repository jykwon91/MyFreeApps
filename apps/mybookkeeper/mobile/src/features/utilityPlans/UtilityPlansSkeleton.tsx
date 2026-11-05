import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { UTILITY_PLAN_MESSAGES, UTILITY_PLAN_SKELETON_ROWS } from "../../constants/utilityPlans";

export default function UtilityPlansSkeleton() {
  const { spacing } = useTheme();
  return (
    <View accessible accessibilityLabel={UTILITY_PLAN_MESSAGES.loadingList} accessibilityRole="progressbar" testID="utility-plans-skeleton">
      {UTILITY_PLAN_SKELETON_ROWS.map((row) => (
        <View key={row} style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
          <Skeleton height={20} width="65%" />
          <Skeleton height={14} width="50%" />
          <Skeleton height={14} width="55%" />
        </View>
      ))}
    </View>
  );
}
