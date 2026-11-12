import { LEASE_PLACEHOLDER_INPUT_TYPE_LABELS, LEASE_PLACEHOLDER_INPUT_TYPES } from "@mybookkeeper/api-client/constants/leaseLabels";
import { LEASE_PLACEHOLDER_DEFAULT_SOURCE_MAX_LENGTH, LEASE_PLACEHOLDER_FORM_PROBLEMS, LEASE_PLACEHOLDER_LABEL_MAX_LENGTH } from "@mybookkeeper/api-client/constants/leasePlaceholderForm";
import type { LeasePlaceholderFormField } from "@mybookkeeper/api-client/types/lease/lease-placeholder-form-field";
import type { LeasePlaceholderFormValues } from "@mybookkeeper/api-client/types/lease/lease-placeholder-form-values";
import type { LeasePlaceholderInputType } from "@mybookkeeper/api-client/types/lease/lease-placeholder-input-type";
import { placeholderDirtyFields, placeholderFormProblems, placeholderToFormValues } from "@mybookkeeper/api-client/utils/leasePlaceholderForm";
import { Banner, FormField, LoadingButton, OptionSheet, PickerField, SwitchRow, useDiscardPrompt, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ScrollView, Text } from "react-native";
import { PLACEHOLDER_MESSAGES as MESSAGES } from "../../constants/leasePlaceholderEdit";
import type { PlaceholderFormScreenProps } from "../../types/PlaceholderFormScreenProps";
import { useSavePlaceholder } from "./useSavePlaceholder";

const TYPE_OPTIONS = LEASE_PLACEHOLDER_INPUT_TYPES.map((type) => ({ value: type, label: LEASE_PLACEHOLDER_INPUT_TYPE_LABELS[type] }));

/** Edits one placeholder. The form starts from a snapshot, so a refetch under it can't change what counts as edited. */
export default function PlaceholderFormScreen({ templateId, placeholder }: PlaceholderFormScreenProps) {
  const { colors, spacing, fontSize } = useTheme();
  const [started] = useState(() => placeholderToFormValues(placeholder));
  const [values, setValues] = useState<LeasePlaceholderFormValues>(started);
  const [hasTried, setHasTried] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { submit, isBusy, isLeaving, message } = useSavePlaceholder(templateId, placeholder.id, started);

  const problems = placeholderFormProblems(values);
  const isDirty = placeholderDirtyFields(values, started).length > 0;
  const locked = isBusy || isLeaving;
  useDiscardPrompt(isDirty && !isLeaving, isBusy);

  function edit<F extends LeasePlaceholderFormField>(field: F, value: LeasePlaceholderFormValues[F]): void {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function save(): void {
    setHasTried(true);
    if (Object.keys(problems).length > 0) return;
    void submit(values);
  }

  const labelProblem = hasTried && problems.display_label ? LEASE_PLACEHOLDER_FORM_PROBLEMS[problems.display_label] : undefined;
  const defaultProblem = hasTried && problems.default_source ? LEASE_PLACEHOLDER_FORM_PROBLEMS[problems.default_source] : undefined;

  return (
    <>
      <ScrollView automaticallyAdjustKeyboardInsets contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {message ? <Banner message={message} /> : null}
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{`${MESSAGES.key}: [${placeholder.key}]`}</Text>
        <FormField
          editable={!locked}
          error={labelProblem}
          hint={MESSAGES.labelHint}
          label={MESSAGES.label}
          maxLength={LEASE_PLACEHOLDER_LABEL_MAX_LENGTH}
          onChangeText={(text) => edit("display_label", text)}
          required
          value={values.display_label}
        />
        <PickerField disabled={locked} label={MESSAGES.type} onPress={() => setIsPickerOpen(true)} valueLabel={LEASE_PLACEHOLDER_INPUT_TYPE_LABELS[values.input_type]} />
        <SwitchRow disabled={locked} label={MESSAGES.requiredSwitch} onValueChange={(next) => edit("required", next)} value={values.required} />
        <FormField
          autoCapitalize="none"
          editable={!locked}
          error={defaultProblem}
          hint={MESSAGES.defaultSourceHint}
          label={MESSAGES.defaultSource}
          maxLength={LEASE_PLACEHOLDER_DEFAULT_SOURCE_MAX_LENGTH}
          onChangeText={(text) => edit("default_source", text)}
          value={values.default_source}
        />
        {values.input_type === "computed" ? (
          <FormField
            autoCapitalize="none"
            editable={!locked}
            hint={MESSAGES.computedHint}
            label={MESSAGES.computedExpr}
            onChangeText={(text) => edit("computed_expr", text)}
            value={values.computed_expr}
          />
        ) : null}
        <LoadingButton disabled={locked || !isDirty} isLoading={isBusy} loadingText={MESSAGES.saving} onPress={save}>
          {MESSAGES.save}
        </LoadingButton>
      </ScrollView>
      <OptionSheet<LeasePlaceholderInputType>
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(type) => {
          setIsPickerOpen(false);
          edit("input_type", type);
        }}
        options={TYPE_OPTIONS}
        title={MESSAGES.chooseType}
        value={values.input_type}
      />
    </>
  );
}
