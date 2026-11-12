import {
  NO_PROFESSIONS_NOTE,
  NOT_A_RECIPE_SPELLS,
  PROFESSIONS_FAILED_NOTE,
} from "@/games/wow-forever/data/character/characterProfessionsConfig";
import { PROFESSION_PARAM, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import { skillColors } from "@/games/wow-forever/crafting/craftRoute";
import { SKILL_PARAM } from "@/games/wow-forever/hooks/useCraftingSkill";
import { CRAFTING_PROFESSION, type CraftingProfession, type CraftRecipe } from "@/games/wow-forever/types/crafting";
import type { CharacterProfessions } from "@/games/wow-forever/types/character/characterProfessions";
import type { CharacterRecipe } from "@/games/wow-forever/types/character/characterRecipe";
import type { KnownRecipeGroup } from "@/games/wow-forever/types/character/knownRecipeGroup";
import { SKILL_COLOR, type SkillColor } from "@/games/wow-forever/types/gathering/skillColor";
import { nodeColor } from "@/games/wow-forever/gathering/nodeColors";

const GUIDE_BY_SKILL_LINE: ReadonlyMap<number, GuideProfession> = new Map(
  (Object.entries(PROFESSION_SKILL_LINES) as [GuideProfession, number][]).map(([guide, line]) => [line, guide]),
);

const CRAFTING: ReadonlySet<string> = new Set(Object.values(CRAFTING_PROFESSION));

const COLOR_ORDER: readonly SkillColor[] = [SKILL_COLOR.orange, SKILL_COLOR.yellow, SKILL_COLOR.green, SKILL_COLOR.grey];

/** Our guide for a Blizzard profession id (the client's SkillLine id), or null for one we have no guide for. */
export function guideProfession(professionId: number): GuideProfession | null {
  return GUIDE_BY_SKILL_LINE.get(professionId) ?? null;
}

/** The crafting profession whose recipe file can colour this guide's recipes, or null. */
export function craftingProfession(guide: GuideProfession | null): CraftingProfession | null {
  if (guide === null || !CRAFTING.has(guide)) return null;
  return guide as CraftingProfession;
}

/** A recipe's colour at this skill, as the game's profession window shows it. */
export function recipeColorAt(recipe: Pick<CraftRecipe, "yellow" | "grey">, skill: number): SkillColor {
  return nodeColor({ orange: 0, ...skillColors(recipe) }, skill);
}

function byName(a: CharacterRecipe, b: CharacterRecipe): number {
  return a.name.localeCompare(b.name);
}

/**
 * The known recipes grouped by colour at `skill` (orange first), each group
 * alphabetical. Recipes `lookup` doesn't have, and spells that aren't crafts
 * (Disenchant), go in a last uncoloured group. No lookup = one uncoloured group.
 */
export function groupKnownRecipes(
  recipes: readonly CharacterRecipe[],
  skill: number,
  lookup: ReadonlyMap<number, Pick<CraftRecipe, "yellow" | "grey">> | null,
): KnownRecipeGroup[] {
  const byColor = new Map<SkillColor, CharacterRecipe[]>();
  const other: CharacterRecipe[] = [];
  for (const recipe of recipes) {
    const data = NOT_A_RECIPE_SPELLS.has(recipe.id) ? undefined : lookup?.get(recipe.id);
    if (!data) {
      other.push(recipe);
      continue;
    }
    const color = recipeColorAt(data, skill);
    byColor.set(color, [...(byColor.get(color) ?? []), recipe]);
  }
  const groups: KnownRecipeGroup[] = COLOR_ORDER.filter((color) => byColor.has(color)).map((color) => ({
    color,
    recipes: [...(byColor.get(color) ?? [])].sort(byName),
  }));
  if (other.length > 0) groups.push({ color: null, recipes: [...other].sort(byName) });
  return groups;
}

/** The profession's guide on our Professions page, opened at the character's skill when the guide follows one. */
export function professionGuideHref(guide: GuideProfession, skill: number): string {
  const base = `/wow-forever/professions?${PROFESSION_PARAM}=${guide}`;
  if (craftingProfession(guide) === null) return base;
  return `${base}&${SKILL_PARAM}=${skill}`;
}

/** Why the section shows a note instead of professions, or null when there are some. */
export function characterProfessionsNote(professions: CharacterProfessions | null): string | null {
  if (professions === null) return PROFESSIONS_FAILED_NOTE;
  if (professions.primaries.length + professions.secondaries.length === 0) return NO_PROFESSIONS_NOTE;
  return null;
}

/** A profession's card opens only when there's more than one entry to list (Fishing knows just "Fishing"). */
export function hasRecipeList(recipes: readonly CharacterRecipe[]): boolean {
  return recipes.length > 1;
}

/** "38 recipes known" / "1 recipe known". */
export function formatRecipeCount(count: number): string {
  const noun = count === 1 ? "recipe" : "recipes";
  return `${count} ${noun} known`;
}

/** How far the skill is toward its rank's cap, 0-100, for the bar. */
export function skillPercent(skill: number, maxSkill: number): number {
  if (maxSkill <= 0) return 0;
  return Math.min(100, (skill / maxSkill) * 100);
}

/** The uncoloured group's heading: "Other" beside coloured groups, "Known recipes" when it is the only list. */
export function otherRecipesLabel(coloured: boolean): string {
  return coloured ? "Other" : "Known recipes";
}
