import { WELCOME_MANUAL_RECIPIENT_NAME_MAX_LENGTH } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import type { WelcomeManualEmailFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-email-form-values";
import type { WelcomeManualResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-response";
import { emailProblems } from "@mybookkeeper/api-client/utils/welcomeManualProblems";
import { Banner, FIELD_PRESETS, FieldError, FormField, KeyboardAwareScroll, LoadingButton, OptionSheet, PickerField, useDiscardPrompt, useFieldChain, useTheme } from "@platform/mobile";
import { useState, type ReactElement } from "react";
import { type RefreshControlProps, View } from "react-native";
import { WELCOME_MANUAL_EMAIL_EMPTY_VALUES, WELCOME_MANUAL_EMAIL_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import { useSnapshotForm } from "../../lib/useSnapshotForm";
import WelcomeManualEmailOutcome from "./WelcomeManualEmailOutcome";
import { emailRoomOptions } from "./welcomeManualRoomOptions";
import { useSendWelcomeManualEmail } from "./useSendWelcomeManualEmail";

interface WelcomeManualEmailFormProps {
  manual: WelcomeManualResponse;
  refreshControl: ReactElement<RefreshControlProps>;
}

/** Emails a guest the guide. A by-the-room manual asks which room's guide to send. */
export default function WelcomeManualEmailForm({ manual, refreshControl }: WelcomeManualEmailFormProps) {
  const { spacing } = useTheme();
  const fields = useFieldChain(["email", "name"]);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const hasRooms = manual.rooms.length > 0;
  const roomOptions = emailRoomOptions(manual.rooms);
  const form = useSnapshotForm<WelcomeManualEmailFormValues>(() => WELCOME_MANUAL_EMAIL_EMPTY_VALUES, (values) => emailProblems(values, hasRooms));
  const { values, edit } = form;
  const { send, outcome, reset, isBusy, failure } = useSendWelcomeManualEmail(manual.id);
  useDiscardPrompt(form.isDirty && !outcome, isBusy);

  if (outcome) return <WelcomeManualEmailOutcome manualId={manual.id} onSendAnother={() => { edit("recipient_email", ""); edit("recipient_name", ""); reset(); }} onTryAgain={reset} outcome={outcome} />;

  return (
    <>
      <KeyboardAwareScroll contentContainerStyle={{ gap: spacing.lg, padding: spacing.lg }} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" refreshControl={refreshControl}>
        {failure ? <Banner message={failure} /> : null}
        <FormField {...FIELD_PRESETS.otherEmail} {...fields.field("email")} editable={!isBusy} error={form.errorFor("recipient_email")} label={MESSAGES.emailLabel} onChangeText={(text) => edit("recipient_email", text)} required value={values.recipient_email} />
        <FormField {...FIELD_PRESETS.otherName} {...fields.field("name")} editable={!isBusy} error={form.errorFor("recipient_name")} label={MESSAGES.nameLabel} maxLength={WELCOME_MANUAL_RECIPIENT_NAME_MAX_LENGTH} onChangeText={(text) => edit("recipient_name", text)} value={values.recipient_name} />
        {hasRooms ? (
          <View style={{ gap: spacing.xs }}>
            <PickerField disabled={isBusy} error={form.errorFor("room_id")} label={MESSAGES.roomLabel} onPress={() => setIsPickerOpen(true)} valueLabel={roomOptions.find((option) => option.value === values.room_id)?.label ?? MESSAGES.noRoomChosen} />
            <FieldError message={form.errorFor("room_id")} name={MESSAGES.roomLabel} />
          </View>
        ) : null}
        <LoadingButton disabled={isBusy} isLoading={isBusy} loadingText={MESSAGES.sending} onPress={() => { if (form.validate()) void send(values); }}>
          {MESSAGES.send}
        </LoadingButton>
      </KeyboardAwareScroll>
      <OptionSheet
        isOpen={isPickerOpen}
        onClose={() => setIsPickerOpen(false)}
        onSelect={(value) => { setIsPickerOpen(false); edit("room_id", value); }}
        options={roomOptions}
        title={MESSAGES.chooseRoom}
        value={values.room_id}
      />
    </>
  );
}
