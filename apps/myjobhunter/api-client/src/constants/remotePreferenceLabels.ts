import type { RemotePreference } from "../types/profile/remote-preference";

/** Each remote preference in words, in the order a picker lists them. */
export const REMOTE_PREFERENCE_LABELS: Record<RemotePreference, string> = {
  remote_only: "Remote only",
  hybrid: "Hybrid",
  onsite: "On-site",
  any: "Open to all",
};
