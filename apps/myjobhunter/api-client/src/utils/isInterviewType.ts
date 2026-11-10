import { INTERVIEW_TYPE_LABELS } from "../constants/interviewTypeLabels";
import type { InterviewType } from "../types/interview-type";

/** True for an interview type this client knows. */
export function isInterviewType(value: string): value is InterviewType {
  return Object.prototype.hasOwnProperty.call(INTERVIEW_TYPE_LABELS, value);
}
