import { SKILL_SUGGESTIONS } from "../constants/discoverySuggestions";
import type { Skill } from "../types/skill/skill";

/** The first profile skills with a name, as suggestions for a saved search. */
export function skillSuggestions(items: readonly Skill[] | undefined): string[] {
  return (items ?? [])
    .map((skill) => skill.name)
    .filter((name): name is string => Boolean(name) && name.trim().length > 0)
    .slice(0, SKILL_SUGGESTIONS);
}
