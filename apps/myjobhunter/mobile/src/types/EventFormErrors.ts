/** What's wrong with a log-event or edit-interview form, per field. */
export interface EventFormErrors {
  occurred_at?: string;
  interview_type?: string;
  interview_duration_minutes?: string;
  interview_location_or_link?: string;
  note?: string;
  interview_interviewer_names?: string;
}
