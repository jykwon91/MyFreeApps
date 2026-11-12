import { useListLanguagesQuery, useListScenariosQuery } from "../store/catalogApi";
import type { PracticeScenario } from "../types/session/practice-scenario";
import type { Profile } from "../types/tutor/profile";

/** The language and scenario for ``/practice?scenario=<slug>``, shared by the web page and the phone screen. */
export function usePracticeScenario(profile: Profile, scenarioSlug: string): PracticeScenario {
  const languages = useListLanguagesQuery();
  const scenarios = useListScenariosQuery(profile.language_code);

  let target: PracticeScenario["target"];
  if (languages.data && scenarios.data) {
    const language = languages.data.find((candidate) => candidate.code === profile.language_code);
    const scenario = scenarios.data.find((candidate) => candidate.slug === scenarioSlug);
    target = language && scenario ? { language, scenario } : null;
  }

  return {
    target,
    isError: languages.isError || scenarios.isError,
    error: languages.error ?? scenarios.error,
    refetch: () => Promise.all([languages.refetch(), scenarios.refetch()]),
  };
}
