import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_RANKS, CRAFTING_TRAINERS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import { learnSkill, mustAcquire, resolveRoute } from "@/games/wow-forever/crafting/craftRoute";
import { learnText } from "@/games/wow-forever/crafting/learnText";
import { baseStep } from "@/games/wow-forever/lib/professionsAddon/baseStep";
import { buildCraftingRanks } from "@/games/wow-forever/lib/professionsAddon/buildRanks";
import { notesOf } from "@/games/wow-forever/lib/professionsAddon/notesOf";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { CraftingProfession, CraftRecipe, ResolvedRouteEntry } from "@/games/wow-forever/types/crafting";
import type { AddonMat } from "@/games/wow-forever/types/professionsAddon/addonMat";
import { ADDON_PROFESSION_KIND, type AddonProfession } from "@/games/wow-forever/types/professionsAddon/addonProfession";
import { ADDON_STEP_KIND, type AddonStep } from "@/games/wow-forever/types/professionsAddon/addonStep";

function matsOf(recipe: CraftRecipe): AddonMat[] {
  return recipe.reagents.map((reagent) => ({ id: reagent.id, name: reagent.name, count: reagent.count }));
}

function stepOf(entry: ResolvedRouteEntry, label: string): AddonStep {
  const confirmed = entry.step.confidence === "confirmed";
  if (entry.kind === "options") {
    return {
      ...baseStep(ADDON_STEP_KIND.options, entry.step.from, entry.step.to, entry.step.title, confirmed),
      text: entry.step.intro,
      options: entry.step.options.map((option, index) => ({
        name: entry.recipes[index].name,
        detail: option.detail,
        yellow: entry.recipes[index].yellow,
        grey: entry.recipes[index].grey,
        mats: matsOf(entry.recipes[index]),
      })),
    };
  }
  return {
    ...baseStep(ADDON_STEP_KIND.craft, entry.step.from, entry.step.to, entry.recipe.name, confirmed),
    spell: entry.recipe.spell,
    yellow: entry.recipe.yellow,
    grey: entry.recipe.grey,
    mats: matsOf(entry.recipe),
    learn: learnText(entry.learn, label),
    learnSkill: learnSkill(entry.learn),
    acquire: mustAcquire(entry.recipe),
    note: entry.step.note ?? null,
  };
}

/** One crafting profession: its hand-picked route to 300 joined to the recipe data, its rank-ups and trainers. */
export function buildCraftingProfession(key: CraftingProfession, data: CraftingData): AddonProfession {
  const guide = CRAFTING_GUIDES[key];
  const entries = resolveRoute(CRAFTING_ROUTES[key], data.recipes, data.trainerSkills);
  return {
    key,
    label: guide.label,
    skillLine: PROFESSION_SKILL_LINES[key],
    kind: ADDON_PROFESSION_KIND.crafting,
    intro: guide.routeIntro,
    steps: entries.map((entry) => stepOf(entry, guide.label)),
    ranks: buildCraftingRanks(CRAFTING_RANKS[key], CRAFTING_TRAINERS[key]),
    notes: notesOf(guide.forever),
    nodes: [],
    mobs: [],
  };
}
