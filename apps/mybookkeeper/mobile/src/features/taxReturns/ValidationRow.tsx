import type { ValidationResult } from "@mybookkeeper/api-client/types/tax/ValidationResult";
import { formatCurrency } from "@platform/core/utils/currency";
import { getFormLabel } from "@mybookkeeper/api-client/utils/taxFormLabel";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { SEVERITY_LABELS, TAX_RETURNS_MESSAGES as MESSAGES } from "../../constants/taxReturns";

/** One check against the return. Opens the form it's about. */
export default function ValidationRow({ result, onPress }: { result: ValidationResult; onPress: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const heading = `${SEVERITY_LABELS[result.severity]} · ${getFormLabel(result.form_name)}`;
  const comparison =
    result.expected_value !== null && result.actual_value !== null
      ? MESSAGES.expectedActual(formatCurrency(result.expected_value), formatCurrency(result.actual_value))
      : null;
  return (
    <Pressable
      accessibilityHint={MESSAGES.formsHint}
      accessibilityLabel={[heading, result.message, comparison].filter(Boolean).join(". ")}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: pressed ? colors.muted : colors.background,
      })}
    >
      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{heading}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{result.message}</Text>
      {comparison ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{comparison}</Text> : null}
    </Pressable>
  );
}
