import type { VersionResponse } from "@myrecipes/api-client/types/recipe/version";

/** Labelled servings and times, leaving out any that are missing, as the website does; zero minutes still shows. */
export function recipeFacts(
  version: Pick<VersionResponse, "servings" | "prep_minutes" | "cook_minutes">,
): { label: string; value: string }[] {
  const facts: { label: string; value: string }[] = [];
  if (version.servings !== null && version.servings !== "") facts.push({ label: "Servings", value: version.servings });
  if (version.prep_minutes !== null) facts.push({ label: "Prep", value: `${version.prep_minutes} min` });
  if (version.cook_minutes !== null) facts.push({ label: "Cook", value: `${version.cook_minutes} min` });
  return facts;
}
