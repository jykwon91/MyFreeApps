import { MapPin } from "lucide-react";
import { showError, extractErrorMessage } from "@platform/ui";
import { REMOTE_PREFERENCE_LABELS } from "@myjobhunter/api-client/constants/remotePreferenceLabels";
import { REMOTE_PREFERENCES } from "@myjobhunter/api-client/constants/remotePreferences";
import { useUpdateProfileMutation } from "@myjobhunter/api-client/store/profileApi";
import type { LocationsSectionProps } from "@/types/profile/locations-section-props";

export default function LocationsSection({ profile }: LocationsSectionProps) {
  const [updateProfile] = useUpdateProfileMutation();

  async function handleRemoteToggle(pref: string) {
    try {
      await updateProfile({ remote_preference: pref }).unwrap();
    } catch (err) {
      showError(`Couldn't update preference: ${extractErrorMessage(err)}`);
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
      <div className="flex gap-2 flex-wrap">
        {REMOTE_PREFERENCES.map((pref) => (
          <button
            key={pref}
            onClick={() => void handleRemoteToggle(pref)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors min-h-[36px] ${
              profile.remote_preference === pref
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted"
            }`}
          >
            {REMOTE_PREFERENCE_LABELS[pref]}
          </button>
        ))}
      </div>
    </section>
  );
}
