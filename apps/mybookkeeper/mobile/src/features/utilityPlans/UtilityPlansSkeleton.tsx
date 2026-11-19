import { LoadingRegion, Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { UTILITY_PLAN_MESSAGES, UTILITY_PLAN_SKELETON_ROWS } from "../../constants/utilityPlans";

export function UtilityPlanSkeletonRow() {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }}>
      <Skeleton height={20} width="65%" />
      <Skeleton height={14} width="50%" />
      <Skeleton height={14} width="55%" />
    </View>
  );
}

export default function UtilityPlansSkeleton() {
  return (
    <LoadingRegion label={UTILITY_PLAN_MESSAGES.loadingList} testID="utility-plans-skeleton">
      {UTILITY_PLAN_SKELETON_ROWS.map((row) => (
        <UtilityPlanSkeletonRow key={row} />
      ))}
    </LoadingRegion>
  );
}
