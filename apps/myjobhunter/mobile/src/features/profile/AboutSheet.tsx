import { useUpdateProfileMutation } from "@myjobhunter/api-client/store/profileApi";
import type { Seniority } from "@myjobhunter/api-client/types/profile/seniority";
import { isSeniority } from "@myjobhunter/api-client/utils/isSeniority";
import { ChoiceGroup, FormField, FormSheet, useToast } from "@platform/mobile";
import { useState } from "react";
import { PROFILE_MESSAGES as MESSAGES } from "../../constants/profile";
import { SENIORITY_CHOICES } from "../../constants/seniorityChoices";
import type { AboutSheetProps } from "../../types/AboutSheetProps";
import SheetButtons from "../../components/forms/SheetButtons";
import { repeatableWriteFailure } from "@myjobhunter/api-client/utils/repeatableWriteFailure";
import { clientRefusalMessage } from "@myjobhunter/api-client/utils/clientRefusalMessage";

/** Edits your level and summary. A failed save shows at the top and keeps what was typed. */
export default function AboutSheet({ profile, onClose }: AboutSheetProps) {
  const { showToast } = useToast();
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const savedSeniority = isSeniority(profile.seniority) ? profile.seniority : "";
  const savedSummary = profile.summary ?? "";
  const [seniority, setSeniority] = useState<Seniority | "">(savedSeniority);
  const [summary, setSummary] = useState(savedSummary);
  const [failure, setFailure] = useState<string | null>(null);

  async function save(): Promise<void> {
    setFailure(null);
    try {
      await updateProfile({ seniority: seniority || null, summary: summary.trim() || null }).unwrap();
      showToast(MESSAGES.aboutSaved);
      onClose();
    } catch (error) {
      setFailure(repeatableWriteFailure(error, (refusal) => clientRefusalMessage(refusal, MESSAGES.couldntSaveAbout)));
    }
  }

  return (
    <FormSheet failure={failure} hasUnsavedChanges={seniority !== savedSeniority || summary !== savedSummary} isBusy={isLoading} isOpen onRequestClose={onClose} title={MESSAGES.aboutSheetTitle}>
      <ChoiceGroup<Seniority | ""> disabled={isLoading} label={MESSAGES.seniorityLabel} onChange={setSeniority} options={SENIORITY_CHOICES} value={seniority} />
      <FormField
        editable={!isLoading}
        label={MESSAGES.summaryLabel}
        multiline
        onChangeText={setSummary}
        placeholder={MESSAGES.summaryPlaceholder}
        value={summary}
      />
      <SheetButtons
        cancelLabel={MESSAGES.cancel}
        isSubmitting={isLoading}
        onSubmit={save}
        submitLabel={MESSAGES.saveChanges}
        submittingLabel={MESSAGES.saving}
      />
    </FormSheet>
  );
}
