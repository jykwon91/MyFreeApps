import { Skeleton, useTheme } from "@platform/mobile";
import { View } from "react-native";
import { UTILITY_COSTS_MESSAGES as MESSAGES, UTILITY_COSTS_SKELETON_MONTHS, UTILITY_COSTS_SKELETON_UTILITIES } from "../../constants/analytics";

export default function UtilityCostsSkeleton() {
  const { spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={MESSAGES.loading}
      accessibilityRole="progressbar"
      style={{ gap: spacing.md, paddingHorizontal: spacing.lg }}
      testID="utility-costs-skeleton"
    >
      <Skeleton height={32} width="60%" />
      <Skeleton height={14} width="45%" />
      {UTILITY_COSTS_SKELETON_UTILITIES.map((row) => (
        <Skeleton height={36} key={`utility-${row}`} width="100%" />
      ))}
      {UTILITY_COSTS_SKELETON_MONTHS.map((row) => (
        <Skeleton height={36} key={`month-${row}`} width="100%" />
      ))}
    </View>
  );
}
