import type { UtilityPlanSummary } from "@mybookkeeper/api-client/types/utility/utility-plan-summary";
import { Chip, MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { planChip, planPriceLine, planProvider, planRowLabel, planTitle } from "./utilityPlanDisplay";

interface UtilityPlanRowProps {
  plan: UtilityPlanSummary;
  todayIso: string;
  onPress: () => void;
}

export default function UtilityPlanRow({ plan, todayIso, onPress }: UtilityPlanRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const chip = planChip(plan, todayIso);
  return (
    <Pressable
      accessibilityLabel={planRowLabel(plan, todayIso)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text numberOfLines={2} style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>
        {planTitle(plan)}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {planProvider(plan)}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.foreground }}>
        {planPriceLine(plan)}
      </Text>
      {chip ? <Chip label={chip} /> : null}
    </Pressable>
  );
}
