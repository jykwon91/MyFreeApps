import { taxFieldEditText, taxFieldOverrideProblems, parseTaxFieldOverride } from "@mybookkeeper/api-client/utils/taxFieldOverride";
import type { FieldOverrideProblems } from "@mybookkeeper/api-client/types/tax/FieldOverrideProblems";
import type { TaxFormField } from "@mybookkeeper/api-client/types/tax/TaxFormField";
import { formatTaxFieldValue } from "@mybookkeeper/api-client/utils/formatTaxFieldValue";
import { TAX_FIELD_LIMITS } from "@mybookkeeper/api-client/constants/taxFieldLimits";
import { Banner, FormField, LoadingButton, SegmentedControl, useTheme } from "@platform/mobile";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text } from "react-native";
import { TAX_FIELD_OVERRIDE_MESSAGES as MESSAGES } from "../../constants/taxFieldOverride";
import { useDiscardPrompt } from "../../lib/useDiscardPrompt";
import { useOverrideTaxField } from "./useOverrideTaxField";

const YES_NO = [
  { value: "true", label: MESSAGES.yes },
  { value: "false", label: MESSAGES.no },
];

/** Changes one field's value by hand, with the reason it's being changed. */
export default function TaxFieldOverrideForm({ returnId, field }: { returnId: string; field: TaxFormField }) {
  const { colors, spacing, fontSize } = useTheme();
  const [initial] = useState(() => taxFieldEditText(field));
  const [text, setText] = useState(initial);
  const [reason, setReason] = useState("");
  const [problems, setProblems] = useState<FieldOverrideProblems>({});
  const { save, isBusy, isLeaving, failure } = useOverrideTaxField(returnId);
  const [action, setAction] = useState<"save" | "clear" | null>(null);
  const locked = isBusy || isLeaving;
  const isBoolean = field.type === "boolean";
  const canClear = !isBoolean && field.value !== null;

  useDiscardPrompt((text !== initial || reason !== "") && !isLeaving, isBusy);

  /** `clear` sends "no value" on purpose; otherwise a blank number is unreadable, never silently empty. */
  function submit(clear: boolean): void {
    const found = taxFieldOverrideProblems(field.type, clear ? "" : text, reason, clear);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    const override = parseTaxFieldOverride(field.type, clear ? "" : text, clear);
    if (!override) return;
    setAction(clear ? "clear" : "save");
    void save({ fieldId: field.id, reason, ...override });
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {failure ? <Banner message={failure} /> : null}
        <Text accessibilityRole="header" style={{ fontSize: fontSize.lg, fontWeight: "700", color: colors.foreground }}>
          {field.label}
        </Text>
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${MESSAGES.currentValue}: ${formatTaxFieldValue(field)}`}</Text>
        {isBoolean ? (
          <SegmentedControl accessibilityLabel={MESSAGES.booleanLabel} onChange={(value) => !locked && setText(value)} segments={YES_NO} value={text === "true" ? "true" : "false"} />
        ) : (
          <FormField
            editable={!locked}
            error={problems.number}
            keyboardType={field.type === "numeric" ? "decimal-pad" : "default"}
            label={MESSAGES.valueLabel}
            maxLength={field.type === "text" ? TAX_FIELD_LIMITS.textMaxLength : undefined}
            onChangeText={(value) => {
              setText(value);
              setProblems((current) => ({ ...current, number: undefined }));
            }}
            placeholder={field.type === "numeric" ? MESSAGES.amountPlaceholder : undefined}
            value={text}
          />
        )}
        <FormField
          editable={!locked}
          error={problems.reason}
          hint={MESSAGES.reasonHint}
          label={MESSAGES.reasonLabel}
          multiline
          onChangeText={(value) => {
            setReason(value);
            setProblems((current) => ({ ...current, reason: undefined }));
          }}
          required
          value={reason}
        />
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{MESSAGES.recalculateNote}</Text>
        <LoadingButton disabled={locked} isLoading={isBusy && action === "save"} loadingText={MESSAGES.saving} onPress={() => submit(false)}>
          {MESSAGES.save}
        </LoadingButton>
        {canClear ? (
          <LoadingButton disabled={locked} isLoading={isBusy && action === "clear"} loadingText={MESSAGES.clearing} onPress={() => submit(true)} variant="secondary">
            {MESSAGES.clear}
          </LoadingButton>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
