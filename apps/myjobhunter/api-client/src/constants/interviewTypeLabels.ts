import type { InterviewType } from "../types/interview-type";

/** Display label per interview type, in the order they're offered. */
export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  phone: "Phone",
  video: "Video",
  onsite: "On-site",
  panel: "Panel",
};
