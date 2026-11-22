import { OCCURRED_AT_HINT } from "@myjobhunter/api-client/constants/eventTimeMessages";
import { EVENT_NOTE_MAX_LENGTH } from "@myjobhunter/api-client/constants/textFieldLimits";
import { useLogApplicationEventMutation } from "@myjobhunter/api-client/store/applicationsApi";
import { characterCounter } from "@platform/core/utils/characterCounter";
import { emptyFormValues } from "@myjobhunter/api-client/utils/interviewEventForm";
import { logEventRequest } from "@myjobhunter/api-client/utils/logEventRequest";
import { FormField, FormSheet, useToast } from "@platform/mobile";
import { useState } from "react";
import { APPLICATION_EVENT_MESSAGES as MESSAGES } from "../../constants/applicationEvents";
import { LOGGABLE_EVENT_OPTIONS } from "../../constants/eventOptions";
import { APPLICATION_DETAIL_MESSAGES } from "../../constants/applicationDetail";
import { createFailure } from "../../lib/writeFailure";
import type { LogEventSheetProps } from "../../types/LogEventSheetProps";
import ChoiceGroup from "../../components/forms/ChoiceGroup";
import DateTimeField from "./DateTimeField";
import InterviewDetailsFields from "./InterviewDetailsFields";
import SheetButtons from "../../components/forms/SheetButtons";
import { useEventForm } from "./useEventForm";

/** Any event the website can log, with interview details for an interview. Opens on now, sent as the moment of submitting if left as is. */
export default function LogEventSheet({ applicationId, onClose }: LogEventSheetProps) {
  const { showToast } = useToast();
  const [logEvent, { isLoading }] = useLogApplicationEventMutation();
  const [opened] = useState(emptyFormValues);
  const form = useEventForm(opened);
  const [failure, setFailure] = useState<string | null>(null);
  const { values, change, errors } = form;

  async function submit(): Promise<void> {
    if (!form.validate()) return;
    setFailure(null);
    try {
      await logEvent({ applicationId, body: logEventRequest(values, opened.occurred_at) }).unwrap();
      onClose();
      showToast(MESSAGES.logged);
    } catch (error) {
      setFailure(createFailure(error, { failed: MESSAGES.couldntLog, checkWhere: MESSAGES.checkWhere, gone: APPLICATION_DETAIL_MESSAGES.gone }));
    }
  }

  return (
    <FormSheet failure={failure} hasUnsavedChanges={form.isDirty} isBusy={isLoading} isOpen onRequestClose={onClose} title={MESSAGES.logTitle}>
      <ChoiceGroup
        disabled={isLoading}
        label={MESSAGES.eventLabel}
        onChange={(type) => change("event_type", type)}
        options={LOGGABLE_EVENT_OPTIONS}
        required
        value={values.event_type}
      />
      <DateTimeField disabled={isLoading} error={errors.occurred_at} hint={OCCURRED_AT_HINT} label={MESSAGES.whenLabel} maximumDate={new Date()} onChange={(next) => change("occurred_at", next)} required value={values.occurred_at} />
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
        onSubmit={submit}
        submitLabel={MESSAGES.logEvent}
        submittingLabel={MESSAGES.logging}
      />
    </FormSheet>
  );
}
