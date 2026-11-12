import { useCreateWorkHistoryMutation, useUpdateWorkHistoryMutation } from "@myjobhunter/api-client/store/workHistoryApi";
import { WORK_HISTORY_COMPANY_MAX_LENGTH, WORK_HISTORY_TITLE_MAX_LENGTH } from "@myjobhunter/api-client/constants/profileFieldLimits";
import type { WorkHistoryFormValues } from "@myjobhunter/api-client/types/work-history/work-history-form-values";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { workHistoryFormProblems } from "@myjobhunter/api-client/utils/workHistoryFormProblems";
import { workHistoryFormValues } from "@myjobhunter/api-client/utils/workHistoryFormValues";
import { workHistoryRequest } from "@myjobhunter/api-client/utils/workHistoryRequest";
import { FormField, FormSheet, SwitchRow, useToast } from "@platform/mobile";
import { useState } from "react";
import { PROFILE_MESSAGES } from "../../constants/profile";
import { WORK_HISTORY_MESSAGES as MESSAGES } from "../../constants/profileWorkHistory";
import { writeFailure } from "../../lib/writeFailure";
import type { WorkHistorySheetProps } from "../../types/WorkHistorySheetProps";
import DateField from "../../components/forms/DateField";
import SheetButtons from "../../components/forms/SheetButtons";

/** Adds a role, or edits one. Problems show under their fields; a failed save shows at the top and keeps what was typed. */
export default function WorkHistorySheet({ existing, onClose }: WorkHistorySheetProps) {
  const { showToast } = useToast();
  const [createWorkHistory, created] = useCreateWorkHistoryMutation();
  const [updateWorkHistory, updated] = useUpdateWorkHistoryMutation();
  const isSaving = created.isLoading || updated.isLoading;
  const [values, setValues] = useState<WorkHistoryFormValues>(() => workHistoryFormValues(existing));
  const [hasTried, setHasTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const problems = hasTried ? workHistoryFormProblems(values) : {};

  function change<Field extends keyof WorkHistoryFormValues>(field: Field) {
    return (value: WorkHistoryFormValues[Field]) => setValues((current) => ({ ...current, [field]: value }));
  }

  async function save(): Promise<void> {
    setHasTried(true);
    if (Object.keys(workHistoryFormProblems(values)).length > 0) return;
    setFailure(null);
    const body = workHistoryRequest(values);
    try {
      if (existing) await updateWorkHistory({ id: existing.id, patch: body }).unwrap();
      else await createWorkHistory(body).unwrap();
      showToast(existing ? MESSAGES.updated : MESSAGES.created);
      onClose();
    } catch (error) {
      setFailure(existing ? writeFailure(error, MESSAGES.couldntUpdate, PROFILE_MESSAGES.gone) : MESSAGES.couldntCreate);
    }
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={() => (isSaving ? undefined : onClose())} title={existing ? MESSAGES.editTitle : MESSAGES.addTitle}>
      <FormField
        autoCapitalize="words"
        counter={characterCounter(values.company_name.trim(), WORK_HISTORY_COMPANY_MAX_LENGTH)}
        editable={!isSaving}
        error={problems.company_name}
        label={MESSAGES.companyLabel}
        onChangeText={change("company_name")}
        placeholder={MESSAGES.companyPlaceholder}
        required
        value={values.company_name}
      />
      <FormField
        autoCapitalize="words"
        counter={characterCounter(values.title.trim(), WORK_HISTORY_TITLE_MAX_LENGTH)}
        editable={!isSaving}
        error={problems.title}
        label={MESSAGES.titleLabel}
        onChangeText={change("title")}
        placeholder={MESSAGES.titlePlaceholder}
        required
        value={values.title}
      />
      <DateField disabled={isSaving} error={problems.start_date} label={MESSAGES.startLabel} onChange={change("start_date")} required value={values.start_date} />
      <SwitchRow
        disabled={isSaving}
        label={MESSAGES.currentLabel}
        // A current role has no end date, so turning this on clears it.
        onValueChange={(isCurrent) => setValues((current) => ({ ...current, is_current: isCurrent, end_date: isCurrent ? "" : current.end_date }))}
        value={values.is_current}
      />
      {values.is_current ? null : (
        <DateField
          disabled={isSaving}
          error={problems.end_date}
          label={MESSAGES.endLabel}
          minimumDate={values.start_date || undefined}
          onChange={change("end_date")}
          value={values.end_date}
        />
      )}
      <FormField
        editable={!isSaving}
        error={problems.bullets}
        hint={MESSAGES.bulletsHint}
        label={MESSAGES.bulletsLabel}
        multiline
        onChangeText={change("bullets")}
        placeholder={MESSAGES.bulletsPlaceholder}
        value={values.bullets}
      />
      <SheetButtons
        cancelLabel={PROFILE_MESSAGES.cancel}
        isSubmitting={isSaving}
        onCancel={onClose}
        onSubmit={save}
        submitLabel={existing ? PROFILE_MESSAGES.saveChanges : MESSAGES.create}
        submittingLabel={existing ? PROFILE_MESSAGES.saving : MESSAGES.creating}
      />
    </FormSheet>
  );
}
