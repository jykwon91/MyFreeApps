import type { ValidationResult } from "@mybookkeeper/api-client/types/tax/ValidationResult";
import { getFormLabel } from "@mybookkeeper/api-client/utils/taxFormLabel";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Text, View } from "react-native";
import { SEVERITY_LABELS } from "../../constants/taxReturns";

export default function ValidationRow({ result }: { result: ValidationResult }) {
  const { colors, spacing, fontSize } = useTheme();
  const heading = `${SEVERITY_LABELS[result.severity]} · ${getFormLabel(result.form_name)}`;
  return (
    <View
      accessible
      accessibilityLabel={`${heading}. ${result.message}`}
      style={{
        minHeight: MIN_TOUCH_TARGET,
        gap: spacing.xs,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: colors.foreground }}>{heading}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{result.message}</Text>
    </View>
  );
}
