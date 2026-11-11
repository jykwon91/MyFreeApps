import { addApplicationFormCounters } from "@myjobhunter/api-client/utils/addApplicationFormCounters";
import type { RemoteType } from "@myjobhunter/api-client/types/application/remote-type";
import { FormField, LoadingButton, OptionSheet, PickerField, useTheme } from "@platform/mobile";
import { useState } from "react";
import { ADD_APPLICATION_MESSAGES as MESSAGES, MULTILINE_MIN_HEIGHT, REMOTE_TYPE_OPTIONS } from "../../constants/addApplication";
import type { ReviewStepProps } from "../../types/ReviewStepProps";
import CompanyField from "./CompanyField";
import ReviewSummary from "./ReviewSummary";

/** The form to check and save: company, role, location, remote and notes, as on the website. */
export default function ReviewStep({ review, values, errors, onEdit, onChangeCompany, onSave, isSaving, isLocked }: ReviewStepProps) {
  const { spacing } = useTheme();
  const [isRemoteOpen, setIsRemoteOpen] = useState(false);
  const locked = isSaving || isLocked;
  const remoteLabel = REMOTE_TYPE_OPTIONS.find((option) => option.value === values.remote_type)?.label ?? "";
  const counters = addApplicationFormCounters(values);
  const showSummary = review.sourceUrl !== null || review.summary !== null;

  return (
    <>
      {showSummary ? <ReviewSummary sourceUrl={review.sourceUrl} summary={review.summary} /> : null}
      <CompanyField company={review.company} disabled={locked} onPress={onChangeCompany} />
      <FormField
        editable={!locked}
        counter={counters.role_title}
        error={errors.role_title}
        label={MESSAGES.roleLabel}
        onChangeText={(text) => onEdit("role_title", text)}
        placeholder={MESSAGES.rolePlaceholder}
        required
        value={values.role_title}
      />
      <FormField
        editable={!locked}
        counter={counters.location}
        error={errors.location}
        label={MESSAGES.locationLabel}
        onChangeText={(text) => onEdit("location", text)}
        placeholder={MESSAGES.locationPlaceholder}
        value={values.location}
      />
      <PickerField disabled={locked} label={MESSAGES.remoteLabel} onPress={() => setIsRemoteOpen(true)} valueLabel={remoteLabel} />
      <FormField
        editable={!locked}
        counter={counters.notes}
        error={errors.notes}
        inputStyle={{ minHeight: MULTILINE_MIN_HEIGHT, paddingTop: spacing.md, textAlignVertical: "top" }}
        label={MESSAGES.notesLabel}
        multiline
        onChangeText={(text) => onEdit("notes", text)}
        placeholder={MESSAGES.notesPlaceholder}
        value={values.notes}
      />
      <LoadingButton disabled={isLocked} isLoading={isSaving} loadingText={MESSAGES.saving} onPress={onSave}>
        {MESSAGES.save}
      </LoadingButton>
      <OptionSheet<RemoteType>
        isOpen={isRemoteOpen}
        onClose={() => setIsRemoteOpen(false)}
        onSelect={(value) => {
          onEdit("remote_type", value);
          setIsRemoteOpen(false);
        }}
        options={REMOTE_TYPE_OPTIONS}
        title={MESSAGES.remoteTitle}
        value={values.remote_type}
      />
    </>
  );
}
