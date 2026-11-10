import type { ClassificationRule } from "@mybookkeeper/api-client/types/classification-rule/classification-rule";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { vendorRuleRowLabel, vendorRuleSummary } from "./vendorRuleDisplay";

interface VendorRuleRowProps {
  rule: ClassificationRule;
  /** Null until known, or when the rule applies to every property. */
  propertyName: string | null;
  onPress: () => void;
}

export default function VendorRuleRow({ rule, propertyName, onPress }: VendorRuleRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  return (
    <Pressable
      accessibilityLabel={vendorRuleRowLabel(rule, propertyName)}
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
        {rule.match_pattern}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
        {vendorRuleSummary(rule, propertyName)}
      </Text>
    </Pressable>
  );
}
