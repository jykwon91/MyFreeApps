import type { PromoteValues } from "../types/PromoteValues";

/** Where the date of birth picker opens: a scroll away from most people. */
export const DOB_PICKER_STARTS_YEARS_AGO = 30;

export const SMOKER_SEGMENTS: { value: PromoteValues["smoker"]; label: string }[] = [
  { value: "unknown", label: "Unknown" },
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

export const PROMOTE_MESSAGES = {
  success: "Promoted to applicant.",
  alreadyPromoted: "That one was already promoted. Here it is.",
  notPromotable: "I can't promote this one. It's already declined or archived.",
  tooYoung: "Applicants must be 18 or older.",
  retry: "I wasn't able to promote that. Want to try again?",
  viewOnly: "You have view-only access.",
  inquiryGone: "I can't find that inquiry anymore.",
} as const;
