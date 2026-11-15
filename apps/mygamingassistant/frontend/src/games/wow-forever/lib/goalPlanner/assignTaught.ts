/**
 * Hang trainer recipes on a profession's trainer visits: each goes on the
 * last visit made at or below the skill it's taught at (learn it there, or at
 * any trainer once you reach it). With no visit before it, it goes on the
 * first; with no visits at all, on `fallback` (a plain trainer trip).
 */
import type { PlanStop } from "@/games/wow-forever/types/goalPlanner/planStop";
import type { TaughtRecipe } from "@/games/wow-forever/types/goalPlanner/taughtRecipe";

export function assignTaught(stops: readonly PlanStop[], recipes: readonly TaughtRecipe[], fallback: () => PlanStop): PlanStop[] {
  const unique = [...new Map(recipes.map((r) => [r.spell, r])).values()].sort((a, b) => a.skill - b.skill);
  if (!unique.length) return [...stops];
  const visits = stops.length ? [...stops] : [fallback()];
  const teaches = visits.map((stop) => [...stop.teaches]);
  for (const recipe of unique) {
    let at = 0;
    visits.forEach((stop, index) => {
      if ((stop.skill ?? 0) <= recipe.skill) at = index;
    });
    if (!teaches[at].some((t) => t.spell === recipe.spell)) teaches[at].push(recipe);
  }
  return visits.map((stop, index) => ({ ...stop, teaches: teaches[index] }));
}
