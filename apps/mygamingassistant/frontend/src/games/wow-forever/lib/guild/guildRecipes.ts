import { PROFESSION_GROUPS } from "@/games/wow-forever/data/professions/professionPicker";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import { RECIPE_QUERY_MAX_LENGTH, RECIPE_QUERY_MIN_LENGTH } from "@/games/wow-forever/data/guild/recipeSearchConfig";
import { formatCount } from "@/games/wow-forever/lib/character/formatCount";
import type { GuildCrafter } from "@/games/wow-forever/types/guild/guildCrafter";
import type { GuildRecipeSearch } from "@/games/wow-forever/types/guild/guildRecipeSearch";

const PROFESSION_NAMES: ReadonlyMap<number, string> = new Map(
  PROFESSION_GROUPS.flatMap((group) => group.options.map((option) => [PROFESSION_SKILL_LINES[option.id], option.label] as const)),
);

/** The profession's name from its SkillLine id ("Tailoring" for 197). */
export function professionName(professionId: number): string {
  return PROFESSION_NAMES.get(professionId) ?? "Profession";
}

/** "148 / 225", "148" without a cap, or null when no skill is stored. */
export function crafterSkill(crafter: GuildCrafter): string | null {
  if (crafter.skill === null) return null;
  if (crafter.max_skill === null) return String(crafter.skill);
  return `${crafter.skill} / ${crafter.max_skill}`;
}

/** The search as sent: trimmed and cut to the server's limit, or "" when too short to search. */
export function searchableQuery(text: string): string {
  const query = text.trim().slice(0, RECIPE_QUERY_MAX_LENGTH).trim();
  return query.length >= RECIPE_QUERY_MIN_LENGTH ? query : "";
}

/** The line above the results. */
export function recipeSearchStatus(result: GuildRecipeSearch): string {
  const found = formatCount(result.recipes.length, "recipe", "recipes");
  if (result.truncated) return `First ${found} matching "${result.query}" — type more of the name to narrow it down`;
  return `${found} matching "${result.query}"`;
}
