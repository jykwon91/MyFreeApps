import type {
  CraftRecipe,
  CraftRouteEntry,
  LearnAt,
  ResolvedRouteEntry,
  TrainerSkills,
} from "@/games/wow-forever/types/crafting";

/** Highest skill a crafting profession reaches in Forever (Artisan). */
export const MAX_CRAFT_SKILL = 300;

/** Skill where each recipe colour starts. Green is half-way between yellow and grey, as in game. */
export function skillColors(recipe: Pick<CraftRecipe, "yellow" | "grey">): { yellow: number; green: number; grey: number } {
  return { yellow: recipe.yellow, green: Math.round((recipe.yellow + recipe.grey) / 2), grey: recipe.grey };
}

/**
 * Expected crafts to go from skill `from` to `to` with this recipe.
 *
 * Below its yellow skill (orange) every craft gives a point. From yellow up
 * the chance falls in a straight line to 0 at grey — the Classic formula
 * `(grey - skill) / (grey - yellow)` — so each point takes 1 / chance crafts
 * on average. Rounded up: you can't craft a fraction.
 */
export function expectedCrafts(recipe: Pick<CraftRecipe, "yellow" | "grey">, from: number, to: number): number {
  let total = 0;
  for (let skill = from; skill < to; skill++) {
    if (skill < recipe.yellow) {
      total += 1;
      continue;
    }
    const chance = (recipe.grey - skill) / (recipe.grey - recipe.yellow);
    if (chance <= 0) return Number.POSITIVE_INFINITY;
    total += 1 / chance;
  }
  return Math.ceil(total - 1e-9);
}

/** Where you learn a recipe: from the start, a Pattern / Formula item, or a trainer (Forever skill estimated). */
export function learnAt(recipe: CraftRecipe, trainerSkills: TrainerSkills): LearnAt {
  const learn = recipe.learn;
  if (learn.source === "start") return { kind: "start" };
  if (learn.source === "item") return { kind: "item", skill: learn.skill, itemId: learn.itemId, item: learn.item };
  const known = trainerSkills[String(recipe.spell)];
  if (!known) return { kind: "trainer", skill: recipe.yellow, estimated: true };
  return { kind: "trainer", skill: known.forever, estimated: known.forever !== known.classic };
}

export function learnSkill(learn: LearnAt): number {
  return learn.kind === "start" ? 1 : learn.skill;
}

/** Join a route to the recipe data. Throws on a spell the data doesn't have — the route is hand-written. */
export function resolveRoute(
  route: readonly CraftRouteEntry[],
  recipes: ReadonlyMap<number, CraftRecipe>,
  trainerSkills: TrainerSkills,
): ResolvedRouteEntry[] {
  function recipeFor(spell: number): CraftRecipe {
    const recipe = recipes.get(spell);
    if (!recipe) throw new Error(`Route recipe ${spell} is not in the data`);
    return recipe;
  }
  return route.map((step) => {
    if (step.kind === "options") {
      return { kind: "options", step, recipes: step.options.map((o) => recipeFor(o.spell)) };
    }
    const recipe = recipeFor(step.spell);
    return {
      kind: "craft",
      step,
      recipe,
      crafts: expectedCrafts(recipe, step.from, step.to),
      learn: learnAt(recipe, trainerSkills),
    };
  });
}

/** Total crafts for the whole route (options rows aren't counted). */
export function totalCrafts(entries: readonly ResolvedRouteEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.kind === "craft" ? e.crafts : 0), 0);
}

/**
 * Index of the row you're on at `skill`: the first row that still raises it.
 * A skill on a boundary (95) is the row that starts there. `null` = no skill
 * given; past the last row = the last row's index + 1.
 */
export function currentEntryIndex(entries: readonly { step: { from: number; to: number } }[], skill: number | null): number | null {
  if (skill === null) return null;
  const index = entries.findIndex((e) => skill < e.step.to);
  return index === -1 ? entries.length : index;
}

function toNumber(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") return Number(raw);
  return Number.NaN;
}

/** Parse a skill from a URL / input: an integer 1–300, else null. */
export function parseSkill(raw: unknown): number | null {
  const value = toNumber(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_CRAFT_SKILL) return null;
  return value;
}
