import type { WorkAuthStatus } from "../types/profile/work-auth-status";

/** Each work authorization status in words. */
export const WORK_AUTH_STATUS_LABELS: Record<WorkAuthStatus, string> = {
  citizen: "Citizen",
  permanent_resident: "Permanent resident",
  h1b: "H-1B",
  tn: "TN",
  opt: "OPT",
  other: "Other",
  unknown: "Not set",
};
