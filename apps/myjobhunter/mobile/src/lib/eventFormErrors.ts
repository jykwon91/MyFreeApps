import {
  INTERVIEW_DURATION_MAX_MINUTES,
  INTERVIEW_DURATION_MIN_MINUTES,
  INTERVIEWER_NAME_MAX_LENGTH,
  INTERVIEWERS_MAX,
} from "@myjobhunter/api-client/constants/interviewDetailLimits";
import type { LogEventFormValues } from "@myjobhunter/api-client/types/log-event-form-values";
import { isInterviewDurationValid } from "@myjobhunter/api-client/utils/isInterviewDurationValid";
import { parseInterviewerNames } from "@myjobhunter/api-client/utils/parseInterviewerNames";
import {
  APPLICATION_EVENT_MESSAGES as MESSAGES,
  durationRangeMessage,
  interviewerNameTooLongMessage,
  tooManyInterviewersMessage,
} from "../constants/applicationEvents";
import type { EventFormErrors } from "../types/EventFormErrors";

/** The website's rules, plus the backend's interviewer limits. Interview fields count only when they're shown. */
export function eventFormErrors(values: LogEventFormValues, hasInterviewFields: boolean): EventFormErrors {
  const errors: EventFormErrors = {};
  if (!values.occurred_at) errors.occurred_at = MESSAGES.whenRequired;
  if (hasInterviewFields && !values.interview_type) errors.interview_type = MESSAGES.typeRequired;
  if (hasInterviewFields && !isInterviewDurationValid(values.interview_duration_minutes)) {
    errors.interview_duration_minutes = durationRangeMessage(INTERVIEW_DURATION_MIN_MINUTES, INTERVIEW_DURATION_MAX_MINUTES);
  }
  if (hasInterviewFields) {
    const names = parseInterviewerNames(values.interview_interviewer_names);
    if (names.length > INTERVIEWERS_MAX) errors.interview_interviewer_names = tooManyInterviewersMessage(INTERVIEWERS_MAX);
    else if (names.some((name) => name.length > INTERVIEWER_NAME_MAX_LENGTH)) {
      errors.interview_interviewer_names = interviewerNameTooLongMessage(INTERVIEWER_NAME_MAX_LENGTH);
    }
  }
  return errors;
}
