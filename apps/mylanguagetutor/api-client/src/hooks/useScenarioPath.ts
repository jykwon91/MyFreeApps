import { useListLanguagesQuery, useListScenariosQuery } from "../store/catalogApi";
import { useGetUsageTodayQuery } from "../store/usageApi";
import type { ScenarioPath } from "../types/catalog/scenario-path";
import type { Profile } from "../types/tutor/profile";

/** The scenario learning path for the learner's language, shared by the web page and the phone tab. */
export function useScenarioPath(profile: Profile): ScenarioPath {
  const languages = useListLanguagesQuery();
  const scenarios = useListScenariosQuery(profile.language_code);
  const usage = useGetUsageTodayQuery();
  const language = languages.data?.find((candidate) => candidate.code === profile.language_code);

  return {
    languageName: language?.display_name ?? profile.language_code,
    scenarios: languages.data && scenarios.data ? scenarios.data : undefined,
    isError: languages.isError || scenarios.isError,
    error: languages.error ?? scenarios.error,
    isCapReached: usage.data?.cap_reached ?? false,
    refetch: () => Promise.all([languages.refetch(), scenarios.refetch(), usage.refetch()]),
  };
}
