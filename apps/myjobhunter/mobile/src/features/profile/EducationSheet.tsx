import {
  EDUCATION_DEGREE_MAX_LENGTH,
  EDUCATION_FIELD_MAX_LENGTH,
  EDUCATION_SCHOOL_MAX_LENGTH,
} from "@myjobhunter/api-client/constants/profileFieldLimits";
import { useCreateEducationMutation, useUpdateEducationMutation } from "@myjobhunter/api-client/store/educationApi";
import type { EducationFormValues } from "@myjobhunter/api-client/types/education/education-form-values";
import { characterCounter } from "@myjobhunter/api-client/utils/characterCounter";
import { educationFormProblems } from "@myjobhunter/api-client/utils/educationFormProblems";
import { educationFormValues } from "@myjobhunter/api-client/utils/educationFormValues";
import { educationRequest } from "@myjobhunter/api-client/utils/educationRequest";
import { FormField, FormSheet, useToast } from "@platform/mobile";
import { useState } from "react";
import { PROFILE_MESSAGES } from "../../constants/profile";
import { EDUCATION_MESSAGES as MESSAGES } from "../../constants/profileEducation";
import { writeFailure } from "../../lib/writeFailure";
import type { EducationSheetProps } from "../../types/EducationSheetProps";
import SheetButtons from "../../components/forms/SheetButtons";

/** Adds a school, or edits one. Problems show under their fields; a failed save shows at the top and keeps what was typed. */
export default function EducationSheet({ existing, onClose }: EducationSheetProps) {
  const { showToast } = useToast();
  const [createEducation, created] = useCreateEducationMutation();
  const [updateEducation, updated] = useUpdateEducationMutation();
  const isSaving = created.isLoading || updated.isLoading;
  const [values, setValues] = useState<EducationFormValues>(() => educationFormValues(existing));
  const [hasTried, setHasTried] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const problems = hasTried ? educationFormProblems(values) : {};

  function change(field: keyof EducationFormValues) {
    return (value: string) => setValues((current) => ({ ...current, [field]: value }));
  }

  async function save(): Promise<void> {
    setHasTried(true);
    if (Object.keys(educationFormProblems(values)).length > 0) return;
    setFailure(null);
    const body = educationRequest(values);
    try {
      if (existing) await updateEducation({ id: existing.id, patch: body }).unwrap();
      else await createEducation(body).unwrap();
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
        counter={characterCounter(values.school.trim(), EDUCATION_SCHOOL_MAX_LENGTH)}
        editable={!isSaving}
        error={problems.school}
        label={MESSAGES.schoolLabel}
        onChangeText={change("school")}
        placeholder={MESSAGES.schoolPlaceholder}
        required
        value={values.school}
      />
      <FormField
        counter={characterCounter(values.degree.trim(), EDUCATION_DEGREE_MAX_LENGTH)}
        editable={!isSaving}
        error={problems.degree}
        label={MESSAGES.degreeLabel}
        onChangeText={change("degree")}
        placeholder={MESSAGES.degreePlaceholder}
        value={values.degree}
      />
      <FormField
        autoCapitalize="words"
        counter={characterCounter(values.field.trim(), EDUCATION_FIELD_MAX_LENGTH)}
        editable={!isSaving}
        error={problems.field}
        label={MESSAGES.fieldLabel}
        onChangeText={change("field")}
        placeholder={MESSAGES.fieldPlaceholder}
        value={values.field}
      />
      <FormField
        editable={!isSaving}
        error={problems.start_year}
        keyboardType="number-pad"
        label={MESSAGES.startYearLabel}
        onChangeText={change("start_year")}
        placeholder={MESSAGES.yearPlaceholder}
        value={values.start_year}
      />
      <FormField
        editable={!isSaving}
        error={problems.end_year}
        keyboardType="number-pad"
        label={MESSAGES.endYearLabel}
        onChangeText={change("end_year")}
        placeholder={MESSAGES.yearPlaceholder}
        value={values.end_year}
      />
      <FormField
        editable={!isSaving}
        error={problems.gpa}
        keyboardType="decimal-pad"
        label={MESSAGES.gpaLabel}
        onChangeText={change("gpa")}
        placeholder={MESSAGES.gpaPlaceholder}
        value={values.gpa}
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
