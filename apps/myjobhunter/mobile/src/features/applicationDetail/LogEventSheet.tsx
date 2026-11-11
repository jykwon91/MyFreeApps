import { EVENT_NOTE_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import { useLogApplicationEventMutation } from "@myjobhunter/api-client/store/applicationsApi";
import { characterCounter } from "@myjobhunter/api-client/utils/characterCounter";
import { emptyFormValues } from "@myjobhunter/api-client/utils/interviewEventForm";
import { logEventRequest } from "@myjobhunter/api-client/utils/logEventRequest";
import { FormField, FormSheet, useToast } from "@platform/mobile";
import { useState } from "react";
import { APPLICATION_EVENT_MESSAGES as MESSAGES } from "../../constants/applicationEvents";
import { LOGGABLE_EVENT_OPTIONS } from "../../constants/eventOptions";
import { writeFailure } from "../../lib/writeFailure";
import type { LogEventSheetProps } from "../../types/LogEventSheetProps";
import ChoiceGroup from "./ChoiceGroup";
import DateTimeField from "./DateTimeField";
import InterviewDetailsFields from "./InterviewDetailsFields";
import SheetButtons from "./SheetButtons";
import { useEventForm } from "./useEventForm";

/** Any event the website can log, with interview details for an interview. Opens on now. */
export default function LogEventSheet({ applicationId, onClose }: LogEventSheetProps) {
  const { showToast } = useToast();
  const [logEvent, { isLoading }] = useLogApplicationEventMutation();
  const form = useEventForm(emptyFormValues());
  const [failure, setFailure] = useState<string | null>(null);
  const { values, change, errors } = form;

  async function submit(): Promise<void> {
    if (!form.validate()) return;
    setFailure(null);
    try {
      await logEvent({ applicationId, body: logEventRequest(values) }).unwrap();
      onClose();
      showToast(MESSAGES.logged);
    } catch (error) {
      setFailure(writeFailure(error, MESSAGES.couldntLog));
    }
  }

  return (
    <FormSheet failure={failure} isOpen onRequestClose={() => (isLoading ? undefined : onClose())} title={MESSAGES.logTitle}>
      <ChoiceGroup
        disabled={isLoading}
        label={MESSAGES.eventLabel}
        onChange={(type) => change("event_type", type)}
        options={LOGGABLE_EVENT_OPTIONS}
        required
        value={values.event_type}
      />
      <DateTimeField disabled={isLoading} error={errors.occurred_at} label={MESSAGES.whenLabel} onChange={(next) => change("occurred_at", next)} required value={values.occurred_at} />
      {form.hasInterviewFields ? <InterviewDetailsFields disabled={isLoading} errors={errors} onChange={change} values={values} /> : null}
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
        submitLabel={MESSAGES.logEvent}
        submittingLabel={MESSAGES.logging}
      />
    </FormSheet>
  );
}
