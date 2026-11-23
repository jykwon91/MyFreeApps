import { REMOTE_PREFERENCE_MESSAGES } from "@myjobhunter/api-client/constants/remotePreferenceMessages";
import { useUpdateProfileMutation } from "@myjobhunter/api-client/store/profileApi";
import type { RemotePreference } from "@myjobhunter/api-client/types/profile/remote-preference";
import { isRemotePreference } from "@myjobhunter/api-client/utils/isRemotePreference";
import { ChoiceGroup, useAnnouncement, useTheme, useToast } from "@platform/mobile";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { PROFILE_MESSAGES as MESSAGES } from "../../constants/profile";
import { REMOTE_CHOICES } from "../../constants/remoteChoices";
import type { RemotePreferenceFieldProps } from "../../types/RemotePreferenceFieldProps";
import { repeatableWriteFailure } from "@myjobhunter/api-client/utils/repeatableWriteFailure";
import { clientRefusalMessage } from "@myjobhunter/api-client/utils/clientRefusalMessage";

/**
 * Saves as soon as a choice is tapped. The tapped choice shows at once and stays until the saved
 * profile shows it too; if the save fails it goes back to what was saved.
 */
export default function RemotePreferenceField({ preference }: RemotePreferenceFieldProps) {
  const { colors, fontSize } = useTheme();
  const { showToast } = useToast();
  const [updateProfile, { isLoading }] = useUpdateProfileMutation();
  const [pending, setPending] = useState<RemotePreference | null>(null);
  // A second tap can land before the disabled state renders; this stops it sending a second save.
  const isSaving = useRef(false);
  const saved = isRemotePreference(preference) ? preference : "";
  useAnnouncement(isLoading ? REMOTE_PREFERENCE_MESSAGES.saving : undefined, "polite");

  // Once the saved profile has caught up with the tap, there's nothing pending any more.
  if (pending !== null && pending === saved) setPending(null);

  async function choose(next: RemotePreference): Promise<void> {
    if (isSaving.current || next === saved) return;
    isSaving.current = true;
    setPending(next);
    try {
      const updated = await updateProfile({ remote_preference: next }).unwrap();
      showToast(REMOTE_PREFERENCE_MESSAGES.saved);
      // The cache holds what the server saved; if that isn't the tapped choice, show what was saved.
      if (updated.remote_preference !== next) setPending(null);
    } catch (error) {
      setPending(null);
      const message = repeatableWriteFailure(error, (refusal) => clientRefusalMessage(refusal, REMOTE_PREFERENCE_MESSAGES.couldntSave));
      if (message) showToast(message, "error");
    } finally {
      isSaving.current = false;
    }
  }

  return (
    <View>
      <ChoiceGroup<RemotePreference>
        disabled={isLoading}
        label={MESSAGES.remoteLabel}
        onChange={(next) => void choose(next)}
        options={REMOTE_CHOICES}
        value={pending ?? saved}
      />
      {isLoading ? (
        <Text style={{ fontSize: fontSize.sm, color: colors.mutedForeground }}>
          {REMOTE_PREFERENCE_MESSAGES.saving}
        </Text>
      ) : null}
    </View>
  );
}
