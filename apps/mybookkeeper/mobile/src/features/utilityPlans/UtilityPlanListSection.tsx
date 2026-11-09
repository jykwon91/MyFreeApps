import type { UtilityPlanSummary } from "@mybookkeeper/api-client/types/utility/utility-plan-summary";
import { useTheme } from "@platform/mobile";
import { router } from "expo-router";
import { Text, View } from "react-native";
import UtilityPlanRow from "./UtilityPlanRow";

interface UtilityPlanListSectionProps {
  heading: string;
  plans: UtilityPlanSummary[];
  todayIso: string;
}

/** A headed run of plan rows, each opening the plan. */
export default function UtilityPlanListSection({ heading, plans, todayIso }: UtilityPlanListSectionProps) {
  const { colors, spacing, fontSize } = useTheme();
  if (plans.length === 0) return null;
  return (
    <View>
      <Text accessibilityRole="header" style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {heading}
      </Text>
      {plans.map((plan) => (
        <UtilityPlanRow key={plan.id} onPress={() => router.push(`/utility-plans/${plan.id}`)} plan={plan} todayIso={todayIso} />
      ))}
    </View>
  );
}
