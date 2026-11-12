/** The level step for a language, as the website and the phone both route it. */
export function onboardingLevelPath(languageCode: string): `/${string}` {
  return `/onboarding/level?language=${encodeURIComponent(languageCode)}`;
}
