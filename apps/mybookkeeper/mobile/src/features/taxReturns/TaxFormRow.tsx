import type { FormSummary } from "@mybookkeeper/api-client/types/tax/FormSummary";
import { getFormLabel } from "@mybookkeeper/api-client/utils/taxFormLabel";
import { taxFormStatus } from "@mybookkeeper/api-client/utils/taxFormStatus";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text } from "react-native";
import { TAX_RETURNS_MESSAGES as MESSAGES } from "../../constants/taxReturns";

/** One form on a return: how much is on it and how its checks came out. Opens the form. */
export default function TaxFormRow({ form, onPress }: { form: FormSummary; onPress: () => void }) {
  const { colors, spacing, fontSize } = useTheme();
  const status = taxFormStatus(form.error_count, form.warning_count);
  const title = getFormLabel(form.form_name);
  const counts = `${MESSAGES.instanceCount(form.instance_count)} · ${MESSAGES.fieldCount(form.field_count)}`;
  return (
    <Pressable
      accessibilityHint={MESSAGES.formsHint}
      accessibilityLabel={`${title}, ${counts}, ${status.label}`}
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
      <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{title}</Text>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{counts}</Text>
      <Text style={{ fontSize: fontSize.sm, fontWeight: "600", color: status.tone === "error" ? colors.destructiveText : colors.foreground }}>
        {status.label}
      </Text>
    </Pressable>
  );
}
