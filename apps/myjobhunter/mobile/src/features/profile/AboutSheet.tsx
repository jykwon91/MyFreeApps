import { useUpdateProfileMutation } from "@myjobhunter/api-client/store/profileApi";
import type { Seniority } from "@myjobhunter/api-client/types/profile/seniority";
import { isSeniority } from "@myjobhunter/api-client/utils/isSeniority";
import { FormField, FormSheet, useToast } from "@platform/mobile";
import { useState } from "react";
import { PROFILE_MESSAGES as MESSAGES } from "../../constants/profile";
import { SENIORITY_CHOICES } from "../../constants/seniorityChoices";
import type { AboutSheetProps } from "../../types/AboutSheetProps";
import ChoiceGroup from "../../components/forms/ChoiceGroup";
import SheetButtons from "../../components/forms/SheetButtons";

/** Edits your level and summary. A failed save shows at the top and keeps what was typed. */
export default function AboutSheet({ profile, onClose }: AboutSheetProps) {
  const { showToast } = useToast();
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [seniority, setSeniority] = useState<Seniority | "">(isSeniority(profile.seniority) ? profile.seniority : "");
  const [summary, setSummary] = useState(profile.summary ?? "");
  const [failure, setFailure] = useState<string | null>(null);

  async function save(): Promise<void> {
    setFailure(null);
    try {
      await updateProfile({ seniority: seniority || null, summary: summary.trim() || null }).unwrap();
      showToast(MESSAGES.aboutSaved);
      onClose();
    } catch {
      setFailure(MESSAGES.couldntSaveAbout);
    }
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={() => (isLoading ? undefined : onClose())} title={MESSAGES.aboutSheetTitle}>
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
        onCancel={onClose}
        onSubmit={save}
        submitLabel={MESSAGES.saveChanges}
        submittingLabel={MESSAGES.saving}
      />
    </FormSheet>
  );
}
