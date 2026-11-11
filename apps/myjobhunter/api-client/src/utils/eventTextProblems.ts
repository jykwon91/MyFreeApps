import { INTERVIEW_LOCATION_MAX_LENGTH } from "../constants/interviewDetailLimits";
import { EVENT_NOTE_MAX_LENGTH } from "../constants/textFieldLimits";
import type { EventTextProblems } from "../types/event-text-problems";
import type { LogEventFormValues } from "../types/log-event-form-values";
import { interviewerNamesProblem } from "./interviewerNamesProblem";
import { tooLongProblem } from "./tooLongProblem";

/**
 * The event note, the interview location and the interviewer names, checked as `logEventRequest` sends
 * them (trimmed). The interview fields only count when they are shown.
 */
export function eventTextProblems(values: LogEventFormValues, hasInterviewFields: boolean): EventTextProblems {
  const problems: EventTextProblems = {};
  const note = tooLongProblem(values.note.trim(), EVENT_NOTE_MAX_LENGTH);
  if (note) problems.note = note;
  if (hasInterviewFields) {
    const locationProblem = tooLongProblem(values.interview_location_or_link.trim(), INTERVIEW_LOCATION_MAX_LENGTH);
    if (locationProblem) problems.interview_location_or_link = locationProblem;
    const interviewers = interviewerNamesProblem(values.interview_interviewer_names);
    if (interviewers) problems.interview_interviewer_names = interviewers;
  }
  return problems;
}
