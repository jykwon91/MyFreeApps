import { WELCOME_MANUAL_FIELD_LABEL_MAX_LENGTH, WELCOME_MANUAL_FIELD_VALUE_MAX_LENGTH } from "@mybookkeeper/api-client/constants/welcomeManualLimits";
import { useCreateSectionFieldMutation, useDeleteSectionFieldMutation, useUpdateSectionFieldMutation } from "@mybookkeeper/api-client/store/welcomeManualsApi";
import type { WelcomeManualFieldFormValues } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-field-form-values";
import type { WelcomeManualSectionFieldResponse } from "@mybookkeeper/api-client/types/welcome-manual/welcome-manual-section-field-response";
import { fieldProblems } from "@mybookkeeper/api-client/utils/welcomeManualProblems";
import { fieldCreateRequest, fieldUpdateRequest } from "@mybookkeeper/api-client/utils/welcomeManualRequests";
import { FormField } from "@platform/mobile";
import { WELCOME_MANUAL_FIELD_MESSAGES as MESSAGES } from "../../constants/welcomeManualForms";
import { useSnapshotForm } from "../../lib/useSnapshotForm";
import WelcomeManualEditSheet from "./WelcomeManualEditSheet";
import { useWelcomeManualItemWrites } from "./useWelcomeManualItemWrites";
import { FIELD_WORDS, FIELD_SHEET_LABELS } from "../../constants/welcomeManualSheets";

interface WelcomeManualFieldSheetProps {
  manualId: string;
  sectionId: string;
  /** null adds a field. */
  field: WelcomeManualSectionFieldResponse | null;
  onClose: () => void;
}

/** Adds a field, or changes or deletes one. Mounted only while open, so each open takes a fresh snapshot. */
export default function WelcomeManualFieldSheet({ manualId, sectionId, field, onClose }: WelcomeManualFieldSheetProps) {
  const [createField] = useCreateSectionFieldMutation();
  const [updateField] = useUpdateSectionFieldMutation();
  const [deleteField] = useDeleteSectionFieldMutation();
  const form = useSnapshotForm<WelcomeManualFieldFormValues>(() => ({ label: field?.label ?? "", value: field?.value ?? "" }), fieldProblems);
  const { values, edit } = form;
  const writes = useWelcomeManualItemWrites({
    words: FIELD_WORDS,
    isNew: field === null,
    hasChanges: form.isDirty,
    messages: { added: MESSAGES.added, saved: MESSAGES.saved, deleted: MESSAGES.deleted, alreadyDeleted: MESSAGES.alreadyDeleted },
    create: () => createField({ manualId, sectionId, data: fieldCreateRequest(values) }).unwrap(),
    update: () => updateField({ manualId, sectionId, fieldId: field?.id ?? "", data: fieldUpdateRequest(values, form.dirty) }).unwrap(),
    remove: () => deleteField({ manualId, sectionId, fieldId: field?.id ?? "" }).unwrap(),
    onDone: onClose,
  });

  return (
    <WelcomeManualEditSheet
      confirmDelete={{ title: MESSAGES.deleteTitle, body: MESSAGES.deleteBody }}
      failure={writes.failure}
      isBusy={writes.isBusy}
      isDeleting={writes.isDeleting}
      isDirty={form.isDirty}
      isNew={field === null}
      isSaving={writes.isSaving}
      labels={FIELD_SHEET_LABELS}
      onClose={onClose}
      onDelete={() => void writes.destroy()}
      onSave={() => { if (form.validate()) void writes.save(); }}
      title={field ? MESSAGES.edit : MESSAGES.add}
    >
      <FormField editable={!writes.isBusy} error={form.errorFor("label")} label={MESSAGES.labelLabel} maxLength={WELCOME_MANUAL_FIELD_LABEL_MAX_LENGTH} onChangeText={(text) => edit("label", text)} required value={values.label} />
      <FormField editable={!writes.isBusy} error={form.errorFor("value")} label={MESSAGES.valueLabel} maxLength={WELCOME_MANUAL_FIELD_VALUE_MAX_LENGTH} onChangeText={(text) => edit("value", text)} value={values.value} />
    </WelcomeManualEditSheet>
  );
}
