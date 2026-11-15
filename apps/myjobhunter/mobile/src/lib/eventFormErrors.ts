import {
  INTERVIEW_DURATION_MAX_MINUTES,
  INTERVIEW_DURATION_MIN_MINUTES,
} from "@myjobhunter/api-client/constants/interviewDetailLimits";
import type { LogEventFormValues } from "@myjobhunter/api-client/types/log-event-form-values";
import { isInterviewDurationValid } from "@myjobhunter/api-client/utils/isInterviewDurationValid";
import { isOccurredAtInFuture } from "@myjobhunter/api-client/utils/isOccurredAtInFuture";
import { OCCURRED_AT_IN_FUTURE_MESSAGE } from "@myjobhunter/api-client/constants/eventTimeMessages";
import { eventTextProblems } from "@myjobhunter/api-client/utils/eventTextProblems";
import {
  APPLICATION_EVENT_MESSAGES as MESSAGES,
  durationRangeMessage,
} from "../constants/applicationEvents";
import type { EventFormErrors } from "../types/EventFormErrors";

/** The website's rules. Interview fields count only when they're shown. */
export function eventFormErrors(values: LogEventFormValues, hasInterviewFields: boolean): EventFormErrors {
  const errors: EventFormErrors = eventTextProblems(values, hasInterviewFields);
  if (!values.occurred_at) errors.occurred_at = MESSAGES.whenRequired;
  else if (isOccurredAtInFuture(values.occurred_at)) errors.occurred_at = OCCURRED_AT_IN_FUTURE_MESSAGE;
  if (hasInterviewFields && !values.interview_type) errors.interview_type = MESSAGES.typeRequired;
  if (hasInterviewFields && !isInterviewDurationValid(values.interview_duration_minutes)) {
    errors.interview_duration_minutes = durationRangeMessage(INTERVIEW_DURATION_MIN_MINUTES, INTERVIEW_DURATION_MAX_MINUTES);
  }
  return errors;
}
