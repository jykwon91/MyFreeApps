/** The practice page for a scenario, as the website routes it. */
export function practicePath(scenarioSlug: string): `/${string}` {
  return `/practice?scenario=${encodeURIComponent(scenarioSlug)}`;
}
