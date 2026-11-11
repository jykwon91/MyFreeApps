import { EVENT_NOTE_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import { useUpdateApplicationEventMutation } from "@myjobhunter/api-client/store/applicationsApi";
import { characterCounter } from "@myjobhunter/api-client/utils/characterCounter";
import { eventToFormValues } from "@myjobhunter/api-client/utils/interviewEventForm";
import { interviewEventUpdateRequest } from "@myjobhunter/api-client/utils/interviewEventUpdateRequest";
import { FormField, FormSheet, useToast } from "@platform/mobile";
import { useState } from "react";
import { APPLICATION_EVENT_MESSAGES as MESSAGES } from "../../constants/applicationEvents";
import { writeFailure } from "../../lib/writeFailure";
import type { EditInterviewSheetProps } from "../../types/EditInterviewSheetProps";
import InterviewDetailsFields from "./InterviewDetailsFields";
import SheetButtons from "../../components/forms/SheetButtons";
import { useEventForm } from "./useEventForm";

/** An interview's details and note are the only parts of an event that can change afterwards. */
export default function EditInterviewSheet({ applicationId, event, onClose }: EditInterviewSheetProps) {
  const { showToast } = useToast();
  const [updateEvent, { isLoading }] = useUpdateApplicationEventMutation();
  const form = useEventForm(eventToFormValues(event));
  const [failure, setFailure] = useState<string | null>(null);
  const { values, change, errors } = form;

  async function submit(): Promise<void> {
    if (!form.validate()) return;
    setFailure(null);
    try {
      await updateEvent({ applicationId, eventId: event.id, body: interviewEventUpdateRequest(values) }).unwrap();
      onClose();
      showToast(MESSAGES.updated);
    } catch (error) {
      setFailure(writeFailure(error, MESSAGES.couldntUpdate));
    }
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={() => (isLoading ? undefined : onClose())} title={MESSAGES.editTitle}>
      <InterviewDetailsFields disabled={isLoading} errors={errors} onChange={change} values={values} />
      <FormField
        editable={!isLoading}
        counter={characterCounter(values.note.trim(), EVENT_NOTE_MAX_LENGTH)}
        error={errors.note}
        label={MESSAGES.noteLabel}
        multiline
        onChangeText={(next) => change("note", next)}
        placeholder={MESSAGES.notePlaceholder}
        value={values.note}
      />
      <SheetButtons
        cancelLabel={MESSAGES.cancel}
        isSubmitting={isLoading}
        onCancel={onClose}
        onSubmit={submit}
        submitLabel={MESSAGES.saveChanges}
        submittingLabel={MESSAGES.saving}
      />
    </FormSheet>
  );
}
