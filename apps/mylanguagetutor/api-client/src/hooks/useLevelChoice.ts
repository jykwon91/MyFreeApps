import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { useState } from "react";
import { useGetProfileQuery, useSaveProfileMutation } from "../store/profileApi";
import type { LevelChoice } from "../types/onboarding/level-choice";
import type { LevelSaveOutcome } from "../types/onboarding/level-save-outcome";
import type { Level } from "../types/tutor/level";
import { levelSaveFailure } from "../utils/levelSaveFailure";

/**
 * Onboarding step 2 (and "Change level" later), shared by the web page and the phone screen.
 * ``languageParam`` is the ``?language=`` the language step passed on, if any. Without one it is
 * the profile's language (Change level); an empty one names no language, so there is none to save.
 */
export function useLevelChoice(languageParam: string | null): LevelChoice {
  const { data: profile, isError: isProfileError } = useGetProfileQuery();
  const [saveProfile, { isLoading: isSaving, error: saveError }] = useSaveProfileMutation();
  const [picked, setPicked] = useState<Level | null>(null);
  const languageCode = languageParam === "" ? null : (languageParam ?? profile?.language_code ?? null);
  const selected = picked ?? profile?.level ?? null;

  async function save(): Promise<LevelSaveOutcome> {
    if (!languageCode || !selected) return "failed";
    try {
      await saveProfile({ language_code: languageCode, level: selected }).unwrap();
      return "saved";
    } catch (error) {
      // The mutation's error also carries a failure to the screen, as saveFailure.
      return isCancelledRequest(error) ? "cancelled" : levelSaveFailure(error);
    }
  }

  return {
    languageCode,
    selected,
    pick: setPicked,
    isProfilePending: profile === undefined && !isProfileError,
    isFirstTime: !profile,
    isSaving,
    saveFailure: saveError === undefined ? null : levelSaveFailure(saveError),
    save,
  };
}
