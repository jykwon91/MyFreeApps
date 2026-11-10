/** Bounds the backend accepts for `interview_details.duration_minutes`: up to a day. */
export const INTERVIEW_DURATION_MIN_MINUTES = 1;
export const INTERVIEW_DURATION_MAX_MINUTES = 1440;

/** Longest `interview_details.location_or_link` the backend accepts. */
export const INTERVIEW_LOCATION_MAX_LENGTH = 1024;

/** Most interviewers one interview can list, and the longest name the backend accepts. */
export const INTERVIEWERS_MAX = 20;
export const INTERVIEWER_NAME_MAX_LENGTH = 200;
