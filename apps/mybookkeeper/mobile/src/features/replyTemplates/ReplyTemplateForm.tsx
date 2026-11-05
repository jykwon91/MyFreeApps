import type { ReplyTemplate } from "@mybookkeeper/api-client/types/inquiry/reply-template";
import { Banner, FormField, LoadingButton, useTheme } from "@platform/mobile";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import {
  messageCounter,
  REPLY_TEMPLATE_BODY_COUNTER_FROM,
  REPLY_TEMPLATE_BODY_MAX_LENGTH,
  REPLY_TEMPLATE_BODY_MIN_HEIGHT,
  REPLY_TEMPLATE_MESSAGES as MESSAGES,
  REPLY_TEMPLATE_NAME_MAX_LENGTH,
  REPLY_TEMPLATE_SUBJECT_MAX_LENGTH,
  REPLY_TEMPLATE_VARIABLES,
  unknownVariablesHint,
} from "../../constants/replyTemplates";
import { useConfirmLeave } from "../../lib/useConfirmLeave";
import type { ReplyTemplateField } from "../../types/ReplyTemplateField";
import type { ReplyTemplateFormValues } from "../../types/ReplyTemplateFormValues";
import CollapsibleSection from "../inquiries/CollapsibleSection";
import TransactionFact from "../transactions/TransactionFact";
import { saveBanner } from "./replyTemplateFailure";
import { changedFields, formProblems, hasAnyText, normalise, toFormValues, unknownVariables } from "./replyTemplateFormValues";
import ReplyTemplateVariableBar from "./ReplyTemplateVariableBar";
import { useSaveReplyTemplate } from "./useSaveReplyTemplate";
import { useVariableInsertion } from "./useVariableInsertion";

/** Makes a template, or changes `original`. The values are kept here, so a reload can't overwrite typing. */
export default function ReplyTemplateForm({ original }: { original: ReplyTemplate | null }) {
  const { spacing } = useTheme();
  const [values, setValues] = useState<ReplyTemplateFormValues>(() => toFormValues(original));
  const [hasTried, setHasTried] = useState(false);
  const { templates, submit, isBusy, isLeaving, failure, clearFailure } = useSaveReplyTemplate(original);
  const insertion = useVariableInsertion(values, (field, text) => setValues((current) => ({ ...current, [field]: text })));

  const clean = normalise(values);
  const problems = formProblems(clean, templates, original?.id ?? null);
  const isDirty = original ? Object.keys(changedFields(values, original)).length > 0 : hasAnyText(values);
  const unknown = unknownVariables(clean.subject, clean.body);
  const banner = failure ? saveBanner(failure) : null;
  const nameError = failure === "nameTaken" ? MESSAGES.nameTaken : hasTried ? problems.name : undefined;
  const messageHint =
    values.body.length >= REPLY_TEMPLATE_BODY_COUNTER_FROM ? messageCounter(values.body.length) : unknown.length > 0 ? unknownVariablesHint(unknown) : undefined;

  useConfirmLeave(isDirty && !isLeaving, (leave) => {
    if (isBusy) return;
    Alert.alert(MESSAGES.discardTitle, MESSAGES.discardBody, [
      { text: MESSAGES.keepEditing, style: "cancel" },
      { text: MESSAGES.discard, style: "destructive", onPress: leave },
    ]);
  });

  function edit(field: keyof ReplyTemplateFormValues, text: string): void {
    setValues((current) => ({ ...current, [field]: text }));
    if (field === "name" && failure === "nameTaken") clearFailure();
  }

  function save(): void {
    setHasTried(true);
    if (Object.keys(problems).length > 0) return;
    void submit(clean);
  }

  function fieldProps(field: ReplyTemplateField) {
    return { ...insertion.fieldProps(field), editable: !isBusy };
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled">
        {banner ? <Banner message={banner} /> : null}
        <FormField
          editable={!isBusy}
          error={nameError}
          hint={MESSAGES.nameHint}
          label={MESSAGES.nameLabel}
          maxLength={REPLY_TEMPLATE_NAME_MAX_LENGTH}
          onChangeText={(name) => edit("name", name)}
          onSubmitEditing={() => insertion.focus("subject")}
          required
          returnKeyType="next"
          value={values.name}
        />
        <FormField
          {...fieldProps("subject")}
          error={hasTried ? problems.subject : undefined}
          label={MESSAGES.subject}
          maxLength={REPLY_TEMPLATE_SUBJECT_MAX_LENGTH}
          onChangeText={(subject) => edit("subject", subject)}
          required
          value={values.subject}
        />
        <FormField
          {...fieldProps("body")}
          error={hasTried ? problems.body : undefined}
          hint={messageHint}
          inputStyle={{ minHeight: REPLY_TEMPLATE_BODY_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
          label={MESSAGES.message}
          maxLength={REPLY_TEMPLATE_BODY_MAX_LENGTH}
          multiline
          onChangeText={(body) => edit("body", body)}
          required
          value={values.body}
        />
        <CollapsibleSection title={MESSAGES.variablesHelp}>
          <View style={{ gap: spacing.sm }}>
            {REPLY_TEMPLATE_VARIABLES.map(({ token, fillsIn }) => (
              <TransactionFact key={token} label={token} value={fillsIn} />
            ))}
          </View>
        </CollapsibleSection>
        <LoadingButton disabled={isBusy || isLeaving} isLoading={isBusy} loadingText={MESSAGES.saving} onPress={save}>
          {original ? MESSAGES.saveChanges : MESSAGES.saveTemplate}
        </LoadingButton>
      </ScrollView>
      <ReplyTemplateVariableBar disabled={isBusy || isLeaving} field={insertion.activeField} onInsert={insertion.insert} />
    </KeyboardAvoidingView>
  );
}
