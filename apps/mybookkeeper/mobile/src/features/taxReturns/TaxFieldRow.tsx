import type { TaxFormField } from "@mybookkeeper/api-client/types/tax/TaxFormField";
import type { TaxFormInstance } from "@mybookkeeper/api-client/types/tax/TaxFormInstance";
import { formatTaxFieldValue } from "@mybookkeeper/api-client/utils/formatTaxFieldValue";
import { MIN_TOUCH_TARGET, useTheme } from "@platform/mobile";
import { Pressable, Text, View } from "react-native";
import { TAX_FIELD_STATUS_LABELS, TAX_FORM_MESSAGES as MESSAGES } from "../../constants/taxForm";
import { taxFieldSource, taxFieldSummary } from "./taxFormDisplay";

interface TaxFieldRowProps {
  field: TaxFormField;
  instance: TaxFormInstance;
  /** Left out when the person can't override values, which makes the row read-only. */
  onOverride: (() => void) | undefined;
}

/** One field: its label and value, where the value came from, and how its check came out. */
export default function TaxFieldRow({ field, instance, onOverride }: TaxFieldRowProps) {
  const { colors, spacing, fontSize } = useTheme();
  const status = TAX_FIELD_STATUS_LABELS[field.validation_status];
  const body = (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: spacing.md }}>
        <Text style={{ flex: 1, fontSize: fontSize.md, color: colors.foreground }}>{field.label}</Text>
        <Text style={{ fontSize: fontSize.md, fontWeight: "600", color: colors.foreground }}>{formatTaxFieldValue(field)}</Text>
      </View>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${taxFieldSource(field, instance)} · ${status}`}</Text>
      {field.validation_message ? <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{field.validation_message}</Text> : null}
    </View>
  );
  const frame = {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  };
  if (!onOverride) {
    return (
      <View accessible accessibilityLabel={taxFieldSummary(field, instance)} style={frame}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint={MESSAGES.editHint}
      accessibilityLabel={taxFieldSummary(field, instance)}
      accessibilityRole="button"
      onPress={onOverride}
      style={({ pressed }) => ({ ...frame, backgroundColor: pressed ? colors.muted : colors.background })}
    >
      {body}
    </Pressable>
  );
}
