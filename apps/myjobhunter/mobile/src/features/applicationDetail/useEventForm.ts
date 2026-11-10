import { INTERVIEW_EVENT_TYPES } from "@myjobhunter/api-client/constants/interviewEventTypes";
import type { LogEventFormValues } from "@myjobhunter/api-client/types/log-event-form-values";
import { useState } from "react";
import { eventFormErrors } from "../../lib/eventFormErrors";
import type { EventForm } from "../../types/EventForm";

/** The state behind the log-event and edit-interview sheets. */
export function useEventForm(initial: LogEventFormValues): EventForm {
  const [values, setValues] = useState(initial);
  const [hasTried, setHasTried] = useState(false);
  const hasInterviewFields = INTERVIEW_EVENT_TYPES.has(values.event_type);
  const errors = eventFormErrors(values, hasInterviewFields);

  return {
    values,
    change: (key, value) => setValues((current) => ({ ...current, [key]: value })),
    errors: hasTried ? errors : {},
    hasInterviewFields,
    validate: () => {
      setHasTried(true);
      return Object.keys(errors).length === 0;
    },
  };
}
