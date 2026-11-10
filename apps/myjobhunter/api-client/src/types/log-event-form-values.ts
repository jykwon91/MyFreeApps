import type { ApplicationEventType } from "./application-event-type";
import type { InterviewType } from "./interview-type";

/**
 * What the log-event and edit-interview forms hold, on the website and the phone.
 * Times are local wall-clock strings, "YYYY-MM-DDTHH:mm" (a datetime-local
 * input's value), and blank when not set; numbers stay strings until submit.
 */
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
