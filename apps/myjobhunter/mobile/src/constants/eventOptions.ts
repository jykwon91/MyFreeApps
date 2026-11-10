import { INTERVIEW_TYPE_LABELS } from "@myjobhunter/api-client/constants/interviewTypeLabels";
import { LOGGABLE_EVENT_TYPES } from "@myjobhunter/api-client/constants/loggableEventTypes";
import type { ApplicationEventType } from "@myjobhunter/api-client/types/application-event-type";
import type { InterviewType } from "@myjobhunter/api-client/types/interview-type";
import { formatEventType } from "@myjobhunter/api-client/utils/formatEventType";
import type { SheetOption } from "@platform/mobile";

/** The events a person can log, labelled as the website labels them. */
export const LOGGABLE_EVENT_OPTIONS: readonly SheetOption<ApplicationEventType>[] = LOGGABLE_EVENT_TYPES.map((type) => ({
  value: type,
  label: formatEventType(type),
}));

export const INTERVIEW_TYPE_OPTIONS: readonly SheetOption<InterviewType>[] = (
  Object.entries(INTERVIEW_TYPE_LABELS) as [InterviewType, string][]
).map(([value, label]) => ({ value, label }));
