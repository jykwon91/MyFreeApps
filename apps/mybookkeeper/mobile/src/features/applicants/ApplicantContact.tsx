import { APPLICANT_CONTACT_EMAIL_MESSAGES as MESSAGES } from "@mybookkeeper/api-client/constants/applicantContactEmail";
import { useUpdateApplicantContactEmailMutation } from "@mybookkeeper/api-client/store/applicantsApi";
import { httpStatus } from "@mybookkeeper/api-client/utils/httpStatus";
import { FormField, LoadingButton, useTheme, useToast } from "@platform/mobile";
import { useState } from "react";
import { View } from "react-native";
import InquiryContact from "../inquiries/InquiryContact";
import { contactEmailFailure } from "./applicantFailures";

interface ApplicantContactProps {
  applicantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  canWrite: boolean;
}

/**
 * Call and email buttons, plus a way to add, change or remove the email. Only
 * shown once the private details are revealed, so the address stays hidden
 * until the host asks for it.
 */
export default function ApplicantContact({ applicantId, name, email, phone, canWrite }: ApplicantContactProps) {
  const { spacing } = useTheme();
  const { showToast } = useToast();
  const [updateEmail, { isLoading }] = useUpdateApplicantContactEmailMutation();
  // The revealed details aren't fetched again after a save, so what's saved lives here.
  const [saved, setSaved] = useState(email);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  async function save(): Promise<void> {
    const next = (draft ?? "").trim() || null;
    setError(undefined);
    try {
      await updateEmail({ applicantId, data: { contact_email: next } }).unwrap();
      setSaved(next);
      setDraft(null);
      showToast(next ? MESSAGES.saved : MESSAGES.removed);
    } catch (failure) {
      if (httpStatus(failure) === 422) setError(MESSAGES.invalid);
      else showToast(contactEmailFailure(failure), "error");
    }
  }

  function cancel(): void {
    setDraft(null);
    setError(undefined);
  }

  if (draft !== null) {
    return (
      <View style={{ gap: spacing.sm }}>
        <FormField
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          editable={!isLoading}
          error={error}
          keyboardType="email-address"
          label={MESSAGES.label}
          onChangeText={setDraft}
          onSubmitEditing={() => void save()}
          value={draft}
        />
        <LoadingButton isLoading={isLoading} loadingText={MESSAGES.saving} onPress={() => void save()}>
          {MESSAGES.save}
        </LoadingButton>
        <LoadingButton disabled={isLoading} onPress={cancel} variant="ghost">
          {MESSAGES.cancel}
        </LoadingButton>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <InquiryContact email={saved} name={name} phone={phone} />
      {canWrite ? (
        <LoadingButton onPress={() => setDraft(saved ?? "")} variant="ghost">
          {saved ? MESSAGES.change : MESSAGES.add}
        </LoadingButton>
      ) : null}
    </View>
  );
}
