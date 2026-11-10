import type { ContactRole } from "../types/contact/contact-role";

/** Display label per contact role. */
export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  interviewer: "Interviewer",
  referrer: "Referrer",
  other: "Other",
};
