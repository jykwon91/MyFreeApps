import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { UTILITY_PLAN_MESSAGES } from "../../constants/utilityPlans";

export default function UtilityPlanDetailSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={UTILITY_PLAN_MESSAGES.loadingOne}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md, padding: spacing.lg }}
      testID="utility-plan-detail-skeleton"
    >
      <Skeleton height={28} width="70%" />
      <Skeleton height={20} width="50%" />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
      <Skeleton height={44} />
    </View>
  );
}
