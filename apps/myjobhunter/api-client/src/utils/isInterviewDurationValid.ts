import { INTERVIEW_DURATION_MAX_MINUTES, INTERVIEW_DURATION_MIN_MINUTES } from "../constants/interviewDetailLimits";

/** A typed duration in minutes is fine blank (it's optional) or as a number within the backend's bounds. */
export function isInterviewDurationValid(value: string): boolean {
  if (value.trim() === "") return true;
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= INTERVIEW_DURATION_MIN_MINUTES && minutes <= INTERVIEW_DURATION_MAX_MINUTES;
}
