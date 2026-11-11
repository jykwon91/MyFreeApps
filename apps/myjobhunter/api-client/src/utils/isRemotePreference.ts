import { REMOTE_PREFERENCES } from "../constants/remotePreferences";
import type { RemotePreference } from "../types/profile/remote-preference";

export function isRemotePreference(value: string | null | undefined): value is RemotePreference {
  return REMOTE_PREFERENCES.some((preference) => preference === value);
}
