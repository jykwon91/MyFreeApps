import { INQUIRY_FIELD_MAX_LENGTH as MAX_LENGTH, INQUIRY_FORM_LABELS as LABELS, INQUIRY_FORM_PLACEHOLDERS as PLACEHOLDERS } from "@mybookkeeper/api-client/constants/inquiryForm";
import { INQUIRY_SOURCE_LABELS, INQUIRY_SOURCES } from "@mybookkeeper/api-client/constants/inquiryLabels";
import { useCreateInquiryMutation } from "@mybookkeeper/api-client/store/inquiriesApi";
import type { InquiryFormValues } from "@mybookkeeper/api-client/types/inquiry/inquiry-form-values";
import type { InquiryResponse } from "@mybookkeeper/api-client/types/inquiry/inquiry-response";
import type { InquirySource } from "@mybookkeeper/api-client/types/inquiry/inquiry-source";
import {
  blankInquiryForm,
  externalInquiryIdLabel,
  inquiryFormProblems,
  inquiryFormToCreateRequest,
  needsExternalInquiryId,
} from "@mybookkeeper/api-client/utils/inquiryForm";
import { FormField, FormSheet, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { Text, View } from "react-native";
import { INQUIRY_CREATE_MESSAGES as MESSAGES } from "../../constants/inquiryCreate";
import { confirmDiscard } from "../../lib/confirmDiscard";
import { dateFromIso } from "../../lib/localDate";
import type { NewInquirySheetProps } from "../../types/NewInquirySheetProps";
import OptionalDateField from "../shell/OptionalDateField";
import { useFormSubmit } from "../shell/useFormSubmit";
import InquiryChoiceGroup from "./InquiryChoiceGroup";
import { inquiryCreateFailure } from "./inquiryCreateFailure";
import InquiryListingField from "./InquiryListingField";
import InquiryReceivedAtField from "./InquiryReceivedAtField";

const SOURCE_CHOICES = INQUIRY_SOURCES.map((source) => ({ value: source, label: INQUIRY_SOURCE_LABELS[source] }));

/** Adds an inquiry by hand, with the website's fields, rules and request. Problems show here, since a toast would sit under the sheet. */
export default function NewInquirySheet({ onClose, onCreated }: NewInquirySheetProps) {
  const { colors, spacing, fontSize } = useTheme();
  const { showToast } = useToast();
  const [createInquiry] = useCreateInquiryMutation();
  const { isBusy, failure, submit } = useFormSubmit();
  const [initial] = useState(() => blankInquiryForm(new Date()));
  const [values, setValues] = useState<InquiryFormValues>(initial);
  const [showProblems, setShowProblems] = useState(false);

  const problems = showProblems ? inquiryFormProblems(values) : {};
  const hasProblems = Object.keys(problems).length > 0;
  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);

  function update(change: Partial<InquiryFormValues>): void {
    setValues((current) => ({ ...current, ...change }));
  }

  function close(): void {
    if (isBusy) return;
    if (isDirty) confirmDiscard(onClose);
    else onClose();
  }

  async function save(): Promise<void> {
    if (isBusy) return;
    if (Object.keys(inquiryFormProblems(values)).length > 0) {
      setShowProblems(true);
      return;
    }
    const result: { inquiry?: InquiryResponse } = {};
    const landed = await submit(async () => {
      result.inquiry = await createInquiry(inquiryFormToCreateRequest(values)).unwrap();
    }, inquiryCreateFailure);
    if (!landed || !result.inquiry) return;
    onClose();
    showToast(MESSAGES.added(values.inquirer_name.trim()));
    onCreated(result.inquiry);
  }

  return (
    <FormSheet failure={failure ?? (hasProblems ? MESSAGES.fixFields : null)} isOpen onRequestClose={close} title={LABELS.title}>
      <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>{LABELS.intro}</Text>
      <View pointerEvents={isBusy ? "none" : "auto"} style={{ gap: spacing.md }}>
        <InquiryChoiceGroup<InquirySource> choices={SOURCE_CHOICES} disabled={isBusy} label={LABELS.source} onSelect={(source) => update({ source })} value={values.source} />
        {needsExternalInquiryId(values.source) ? (
          <FormField
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!isBusy}
            error={problems.external_inquiry_id}
            label={externalInquiryIdLabel(values.source)}
            maxLength={MAX_LENGTH.externalId}
            onChangeText={(external_inquiry_id) => update({ external_inquiry_id })}
            placeholder={PLACEHOLDERS.externalId}
            required
            value={values.external_inquiry_id}
          />
        ) : null}
        <FormField
          autoComplete="name"
          editable={!isBusy}
          error={problems.inquirer_name}
          label={LABELS.name}
          maxLength={MAX_LENGTH.name}
          onChangeText={(inquirer_name) => update({ inquirer_name })}
          required
          value={values.inquirer_name}
        />
        <FormField
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!isBusy}
          keyboardType="email-address"
          label={LABELS.email}
          maxLength={MAX_LENGTH.email}
          onChangeText={(inquirer_email) => update({ inquirer_email })}
          value={values.inquirer_email}
        />
        <FormField
          autoComplete="tel"
          editable={!isBusy}
          keyboardType="phone-pad"
          label={LABELS.phone}
          maxLength={MAX_LENGTH.phone}
          onChangeText={(inquirer_phone) => update({ inquirer_phone })}
          value={values.inquirer_phone}
        />
        <FormField
          editable={!isBusy}
          label={LABELS.employer}
          maxLength={MAX_LENGTH.employer}
          onChangeText={(inquirer_employer) => update({ inquirer_employer })}
          placeholder={PLACEHOLDERS.employer}
          value={values.inquirer_employer}
        />
        <OptionalDateField
          disabled={isBusy}
          label={LABELS.startDate}
          onChange={(date) => update({ desired_start_date: date ?? "" })}
          startsAt={new Date()}
          value={values.desired_start_date || null}
        />
        <OptionalDateField
          disabled={isBusy}
          error={problems.desired_end_date}
          label={LABELS.endDate}
          onChange={(date) => update({ desired_end_date: date ?? "" })}
          startsAt={values.desired_start_date ? dateFromIso(values.desired_start_date) : new Date()}
          value={values.desired_end_date || null}
        />
        <InquiryListingField disabled={isBusy} onChange={(listing_id) => update({ listing_id })} value={values.listing_id} />
        <InquiryReceivedAtField error={problems.received_at} onChange={(received_at) => update({ received_at })} value={values.received_at} />
        <FormField
          editable={!isBusy}
          label={LABELS.notes}
          maxLength={MAX_LENGTH.notes}
          multiline
          onChangeText={(notes) => update({ notes })}
          value={values.notes}
        />
      </View>
      <LoadingButton isLoading={isBusy} loadingText={MESSAGES.saving} onPress={() => void save()}>
        {MESSAGES.save}
      </LoadingButton>
      <LoadingButton disabled={isBusy} onPress={close} variant="ghost">
        {MESSAGES.cancel}
      </LoadingButton>
    </FormSheet>
  );
}
