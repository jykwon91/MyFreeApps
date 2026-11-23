import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { useState } from "react";
import { useListLanguagesQuery } from "../store/catalogApi";
import { useGetProfileQuery, useSaveProfileMutation } from "../store/profileApi";
import type { LevelChoice } from "../types/onboarding/level-choice";
import type { LevelSaveOutcome } from "../types/onboarding/level-save-outcome";
import type { Level } from "../types/tutor/level";
import { levelSaveFailure } from "../utils/levelSaveFailure";

/**
 * Onboarding step 2 (and "Change level" later), shared by the web page and the phone screen.
 * ``languageParam`` is the ``?language=`` the language step passed on, if any. Without one it is
 * the profile's language (Change level). An empty one, or one that isn't a language on offer, names
 * no language, so there is none to save.
 */
export function useLevelChoice(languageParam: string | null): LevelChoice {
  const { data: profile, isError: isProfileError, isFetching: isProfileFetching, refetch: refetchProfile } = useGetProfileQuery();
  const { data: languages, isError: isLanguagesError } = useListLanguagesQuery(undefined, { skip: !languageParam });
  const [saveProfile, { isLoading: isSaving, error: saveError, reset: resetSave }] = useSaveProfileMutation();
  const [picked, setPicked] = useState<Level | null>(null);

  // A chosen language is checked against the languages on offer. If they can't load, the server decides.
  const isCheckingLanguage = Boolean(languageParam) && languages === undefined && !isLanguagesError;
  const isUnknownLanguage = Boolean(languageParam) && languages !== undefined && !languages.some((language) => language.code === languageParam);
  const languageCode =
    languageParam === null ? (profile?.language_code ?? null) : isCheckingLanguage || isUnknownLanguage ? null : languageParam || null;
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

  function pick(level: Level): void {
    // A failure belongs to the choice that was saved, not the next one.
    resetSave();
    setPicked(level);
  }

  return {
    languageCode,
    selected,
    pick,
    isPending: isCheckingLanguage || (languageParam === null && profile === undefined && !isProfileError),
    loadFailed: languageParam === null && profile === undefined && isProfileError,
    retry: async () => {
      await refetchProfile();
    },
    isRetrying: isProfileFetching,
    isFirstTime: !profile,
    isSaving,
    saveFailure: saveError === undefined ? null : levelSaveFailure(saveError),
    save,
  };
}
