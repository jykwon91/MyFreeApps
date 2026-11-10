import type { ApplicationEventUpdateRequest } from "../types/application-event-update-request";
import type { LogEventFormValues } from "../types/log-event-form-values";
import { buildInterviewDetails } from "./interviewEventForm";

/** The PATCH body for an interview event's edited details and note. Both are sent, so clearing one clears it. */
export function interviewEventUpdateRequest(values: LogEventFormValues): ApplicationEventUpdateRequest {
  return {
    interview_details: buildInterviewDetails(values),
    note: values.note.trim() || null,
  };
}
