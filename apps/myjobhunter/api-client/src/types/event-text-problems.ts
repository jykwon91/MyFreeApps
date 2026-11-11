/** Why an event's free-text fields can't be saved yet, keyed by the field. */
export interface EventTextProblems {
  note?: string;
  interview_location_or_link?: string;
  interview_interviewer_names?: string;
}
