import { MapPin } from "lucide-react";
import { useRef, useState } from "react";
import { showError, showSuccess } from "@platform/ui";
import { REMOTE_PREFERENCE_MESSAGES } from "@myjobhunter/api-client/constants/remotePreferenceMessages";
import { REMOTE_PREFERENCE_LABELS } from "@myjobhunter/api-client/constants/remotePreferenceLabels";
import { REMOTE_PREFERENCES } from "@myjobhunter/api-client/constants/remotePreferences";
import { useUpdateProfileMutation } from "@myjobhunter/api-client/store/profileApi";
import type { RemotePreference } from "@myjobhunter/api-client/types/profile/remote-preference";
import { repeatableWriteFailure } from "@myjobhunter/api-client/utils/repeatableWriteFailure";
import type { LocationsSectionProps } from "@/types/profile/locations-section-props";

export default function LocationsSection({ profile }: LocationsSectionProps) {
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [pending, setPending] = useState<RemotePreference | null>(null);
  // A second click can land before the disabled state renders; this stops it sending a second save.
  const isSaving = useRef(false);

  async function handleRemoteToggle(pref: RemotePreference) {
    if (isSaving.current || pref === profile.remote_preference) return;
    isSaving.current = true;
    setPending(pref);
    try {
      await updateProfile({ remote_preference: pref }).unwrap();
      showSuccess(REMOTE_PREFERENCE_MESSAGES.saved);
    } catch (err) {
      const message = repeatableWriteFailure(err, () => REMOTE_PREFERENCE_MESSAGES.couldntSave);
      if (message) showError(message);
    } finally {
      setPending(null);
      isSaving.current = false;
    }
  }

  return (
    <section className="border rounded-lg p-6">
      <div className="flex items-center gap-2 mb-4">
        <MapPin size={16} className="text-muted-foreground" />
        <h2 className="font-semibold">Locations</h2>
      </div>
      <div className="mb-3">
        {profile.locations.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {profile.locations.map((loc) => (
              <span
                key={loc}
                className="text-xs bg-muted px-2 py-1 rounded-full"
              >
                {loc}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No target locations set</p>
        )}
      </div>
      <div
        role="group"
        aria-label="Remote preference"
        aria-busy={isLoading}
        className="flex gap-2 flex-wrap"
      >
        {REMOTE_PREFERENCES.map((pref) => {
          const isChosen = (pending ?? profile.remote_preference) === pref;
          return (
            <button
              key={pref}
              type="button"
              disabled={isLoading}
              aria-pressed={isChosen}
              onClick={() => void handleRemoteToggle(pref)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors min-h-[36px] disabled:cursor-not-allowed ${
                isChosen
                  ? "bg-primary text-primary-foreground border-primary"
                  : "hover:bg-muted disabled:opacity-60 disabled:hover:bg-transparent"
              }`}
            >
              {pending === pref ? "Saving…" : REMOTE_PREFERENCE_LABELS[pref]}
            </button>
          );
        })}
      </div>
      <p role="status" className="sr-only">
        {isLoading ? REMOTE_PREFERENCE_MESSAGES.saving : ""}
      </p>
    </section>
  );
}
