import type { RemoteType } from "../types/application/remote-type";

/** Display label per remote type. "unknown" has none: the application doesn't say. */
export const REMOTE_TYPE_LABELS: Record<RemoteType, string | null> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "Onsite",
  unknown: null,
};
