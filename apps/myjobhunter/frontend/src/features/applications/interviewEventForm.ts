/**
 * Shared react-hook-form types and (de)serialisation helpers for the
 * interview_details + note sub-form. Used by:
 *
 * - `LogEventDialog` — create-mode form for any event_type
 * - `EventListItem` — inline edit-in-place for an existing interview event
 *
 * Keeping these in one place ensures the same field names, defaults, and
 * (de)serialisation rules are shared across both surfaces.
 */
import type {
  ApplicationEvent,
  ApplicationEventType,
} from "@/types/application-event";
import type {
  InterviewType,
  InterviewDetails,
} from "@/types/interview-details";

export interface LogEventFormValues {
  event_type: ApplicationEventType;
  occurred_at: string;
  note: string;
  interview_type: InterviewType | "";
  interview_scheduled_at: string;
  interview_duration_minutes: string;
  interview_location_or_link: string;
  interview_interviewer_names: string;
}

export function defaultOccurredAt(): string {
  const now = new Date();
  const tzOffsetMs = now.getTimezoneOffset() * 60_000;
  const local = new Date(now.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 16);
}

export function isoToDatetimeLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  const local = new Date(d.getTime() - tzOffsetMs);
  return local.toISOString().slice(0, 16);
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
    interview_type: (details?.type as InterviewType) ?? "",
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

  const names = values.interview_interviewer_names
    .split("\n")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

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
