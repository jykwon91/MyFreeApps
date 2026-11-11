import type { RemotePreference } from "../types/profile/remote-preference";

/** Every remote preference, in the order the profile offers them. */
export const REMOTE_PREFERENCES: readonly RemotePreference[] = ["remote_only", "hybrid", "onsite", "any"];
