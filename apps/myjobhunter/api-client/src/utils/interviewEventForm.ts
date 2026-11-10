/**
 * (De)serialisation helpers for the interview_details + note sub-form,
 * shared by every surface that logs or edits an event:
 *
 * - the website's `LogEventDialog` and `EventListItem` inline edit
 * - the phone's log-event and edit-interview sheets
 *
 * Keeping these in one place ensures the same field names, defaults, and
 * (de)serialisation rules everywhere.
 */
import type { ApplicationEvent } from "../types/application-event";
import type { InterviewDetails } from "../types/interview-details";
import type { LogEventFormValues } from "../types/log-event-form-values";
import { isInterviewType } from "./isInterviewType";
import { parseInterviewerNames } from "./parseInterviewerNames";

const MS_PER_MINUTE = 60_000;
/** "YYYY-MM-DDTHH:mm" — the length of a datetime-local value. */
const LOCAL_DATETIME_LENGTH = 16;

/** A moment as local wall-clock "YYYY-MM-DDTHH:mm". */
export function dateToLocalDateTime(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * MS_PER_MINUTE);
  return local.toISOString().slice(0, LOCAL_DATETIME_LENGTH);
}

/** Now, as local wall-clock "YYYY-MM-DDTHH:mm". */
export function defaultOccurredAt(): string {
  return dateToLocalDateTime(new Date());
}

/** A stored ISO timestamp as local wall-clock "YYYY-MM-DDTHH:mm"; blank when there is none. */
export function isoToDatetimeLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateToLocalDateTime(d);
}

export function emptyFormValues(): LogEventFormValues {
  return {
    event_type: "applied",
    occurred_at: defaultOccurredAt(),
    note: "",
    interview_type: "",
    interview_scheduled_at: "",
    interview_duration_minutes: "",
    interview_location_or_link: "",
    interview_interviewer_names: "",
  };
}

export function eventToFormValues(event: ApplicationEvent): LogEventFormValues {
  const details = event.interview_details;
  return {
    event_type: event.event_type,
    occurred_at: isoToDatetimeLocalInput(event.occurred_at),
    note: event.note ?? "",
    interview_type: details && isInterviewType(details.type) ? details.type : "",
    interview_scheduled_at: isoToDatetimeLocalInput(details?.scheduled_at),
    interview_duration_minutes:
      details?.duration_minutes != null ? String(details.duration_minutes) : "",
    interview_location_or_link: details?.location_or_link ?? "",
    interview_interviewer_names: (details?.interviewer_names ?? []).join("\n"),
  };
}

export function buildInterviewDetails(
  values: LogEventFormValues,
): InterviewDetails | null {
  if (!values.interview_type) return null;

  const names = parseInterviewerNames(values.interview_interviewer_names);

  const details: InterviewDetails = { type: values.interview_type };
  if (values.interview_scheduled_at) {
    details.scheduled_at = new Date(values.interview_scheduled_at).toISOString();
  }
  if (values.interview_duration_minutes) {
    const n = Number(values.interview_duration_minutes);
    if (Number.isFinite(n) && n > 0) details.duration_minutes = n;
  }
  if (values.interview_location_or_link.trim()) {
    details.location_or_link = values.interview_location_or_link.trim();
  }
  if (names.length > 0) {
    details.interviewer_names = names;
  }
  return details;
}
