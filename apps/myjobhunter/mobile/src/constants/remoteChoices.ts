import { REMOTE_PREFERENCE_LABELS } from "@myjobhunter/api-client/constants/remotePreferenceLabels";
import { REMOTE_PREFERENCES } from "@myjobhunter/api-client/constants/remotePreferences";
import type { RemotePreference } from "@myjobhunter/api-client/types/profile/remote-preference";
import type { SheetOption } from "@platform/mobile";

/** The Profile tab's remote-preference choices, in the website's order. */
export const REMOTE_CHOICES: readonly SheetOption<RemotePreference>[] = REMOTE_PREFERENCES.map((value) => ({ value, label: REMOTE_PREFERENCE_LABELS[value] }));
