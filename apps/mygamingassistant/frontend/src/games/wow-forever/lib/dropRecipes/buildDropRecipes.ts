import { learnAt, learnSkill } from "@/games/wow-forever/crafting/craftRoute";
import { COMMON_DROP_MOBS, RARE_DROP_PERCENT } from "@/games/wow-forever/food/recipeSources";
import { recipeIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import type { CraftingByProfession } from "@/games/wow-forever/types/auctionHouse/craftingByProfession";
import type { CraftingProfession, CraftRecipe } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { DropRecipe } from "@/games/wow-forever/types/dropRecipes/dropRecipe";
import { DROP_RECIPE_SOURCE, type DropRecipeSource } from "@/games/wow-forever/types/dropRecipes/dropRecipeSource";
import type { RandomDrop } from "@/games/wow-forever/types/dropRecipes/randomDrop";
import type { InstanceDrop } from "@/games/wow-forever/types/itemPages/instanceDrop";
import { INSTANCE_KIND } from "@/games/wow-forever/types/itemPages/instanceKind";
import type { DropMob, DropSource } from "@/games/wow-forever/types/recipeSources";

const byChance = <T extends { chance: number }>(rows: readonly T[]): T[] => [...rows].sort((a, b) => b.chance - a.chance);

/** Many mobs share it (a world-drop pool, or COMMON_DROP_MOBS or more kinds): any of them can drop it, rarely. */
function isRandomDrop(drop: DropSource): boolean {
  return drop.world || drop.mobs.length + drop.more >= COMMON_DROP_MOBS;
}

function randomDrop(drop: DropSource): RandomDrop {
  return { mobs: drop.mobs.length + drop.more, levels: drop.levels, zones: drop.zones };
}

function sourcesOf(targets: readonly DropMob[], instanceDrops: readonly InstanceDrop[], random: RandomDrop | null): DropRecipeSource[] {
  const sources: DropRecipeSource[] = [];
  if (targets.length) sources.push(DROP_RECIPE_SOURCE.openWorld);
  if (instanceDrops.some((d) => d.instance.kind === INSTANCE_KIND.dungeon)) sources.push(DROP_RECIPE_SOURCE.dungeon);
  if (instanceDrops.some((d) => d.instance.kind === INSTANCE_KIND.raid)) sources.push(DROP_RECIPE_SOURCE.raid);
  if (random) sources.push(DROP_RECIPE_SOURCE.random);
  return sources;
}

function dropRecipe(profession: CraftingProfession, data: CraftingData, recipe: CraftRecipe): DropRecipe | null {
  const { learn } = recipe;
  if (learn.source !== "item") return null;
  const found = data.sources.recipe(learn.itemId);
  if (found.vendors.length || found.quests.length) return null;
  const drop = found.drop;
  const pooled = drop != null && isRandomDrop(drop);
  // A chance stored as 0 is under 0.01% (rounded away): never a farm spot. In a random pool only a mob
  // that drops it at least RARE_DROP_PERCENT of the time is worth hunting; the pool's other mobs
  // (dungeon ones included) are the random drop itself.
  const worthIt = (row: { chance: number }) => row.chance > 0 && (!pooled || row.chance >= RARE_DROP_PERCENT);
  const targets = byChance((drop?.mobs ?? []).filter(worthIt));
  const instanceDrops = byChance(data.sources.recipeInstanceDrops(learn.itemId).filter(worthIt));
  // Mobs drop it but none often enough to hunt: that's a random drop too.
  const nothingToHunt = !targets.length && !instanceDrops.length;
  const random = drop && (pooled || nothingToHunt) ? randomDrop(drop) : null;
  const sources = sourcesOf(targets, instanceDrops, random);
  if (!sources.length) return null;
  return {
    key: `${profession}:${recipe.spell}`,
    profession,
    spell: recipe.spell,
    name: recipe.name,
    icon: recipeIcon(recipe),
    skill: learnSkill(learnAt(recipe, data.trainerSkills)),
    item: { id: learn.itemId, name: learn.item },
    bindOnPickup: learn.bop === true,
    sources,
    targets,
    moreTargets: random ? 0 : (drop?.more ?? 0),
    instanceDrops,
    random,
    bestChance: Math.max(0, ...targets.map((m) => m.chance), ...instanceDrops.map((d) => d.chance)),
  };
}

/** Every crafting recipe learned only from a dropped item, per profession (Classic data). */
export function buildDropRecipes(crafting: CraftingByProfession): DropRecipe[] {
  return [...crafting].flatMap(([profession, data]) =>
    data.file.recipes.flatMap((recipe) => {
      const found = dropRecipe(profession, data, recipe);
      return found ? [found] : [];
    }),
  );
}
