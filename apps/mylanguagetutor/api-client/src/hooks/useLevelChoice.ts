import { useState } from "react";
import { useGetProfileQuery, useSaveProfileMutation } from "../store/profileApi";
import type { LevelChoice } from "../types/onboarding/level-choice";
import type { Level } from "../types/tutor/level";

/**
 * Onboarding step 2 (and "Change level" later), shared by the web page and the phone screen.
 * ``languageParam`` is the ``?language=`` the language step passed on, if any. Without one it is
 * the profile's language (Change level); an empty one names no language, so there is none to save.
 */
export function useLevelChoice(languageParam: string | null): LevelChoice {
  const { data: profile, isError: isProfileError } = useGetProfileQuery();
  const [saveProfile, { isLoading: isSaving, isError: isSaveError }] = useSaveProfileMutation();
  const [picked, setPicked] = useState<Level | null>(null);
  const languageCode = languageParam === "" ? null : (languageParam ?? profile?.language_code ?? null);
  const selected = picked ?? profile?.level ?? null;

  async function save(): Promise<boolean> {
    if (!languageCode || !selected) return false;
    try {
      await saveProfile({ language_code: languageCode, level: selected }).unwrap();
      return true;
    } catch {
      // The mutation's isError carries the failure to the screen.
      return false;
    }
  }

  return {
    languageCode,
    selected,
    pick: setPicked,
    isProfilePending: profile === undefined && !isProfileError,
    isFirstTime: !profile,
    isSaving,
    isSaveError,
    save,
  };
}
