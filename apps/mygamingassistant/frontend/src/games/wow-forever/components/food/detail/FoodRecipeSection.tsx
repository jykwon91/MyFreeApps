import { Link } from "react-router-dom";
import FoodSourceList from "@/games/wow-forever/components/food/detail/FoodSourceList";
import { DETAIL_LINK, DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import { hasSources, skillLine, unknownSource } from "@/games/wow-forever/food/recipeSources";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import type { FoodRecord } from "@/games/wow-forever/types/food";
import type { ItemSources } from "@/games/wow-forever/types/recipeSources";

interface FoodRecipeSectionProps {
  food: FoodRecord;
  sources: ItemSources;
  /** Cooking skill to learn it (the recipe item's, or the Classic trainer's). */
  learnAt: number | null;
  cookingSkill: number | null;
  faction: PlayerFaction;
  zoneId: number | null;
  /** The player's level, to rank the mobs they can farm first. Null = not set. */
  level: number | null;
}

/** "You have 60 — 15 to go." */
function yourSkill(cookingSkill: number, learnAt: number | null): string {
  if (learnAt !== null && cookingSkill < learnAt) return `You have ${cookingSkill} — ${learnAt - cookingSkill} to go.`;
  return `You have ${cookingSkill}.`;
}

/** How to learn the recipe: the skill it takes and where the recipe comes from. */
export default function FoodRecipeSection({ food, sources, learnAt, cookingSkill, faction, zoneId, level }: FoodRecipeSectionProps) {
  const { learn } = food;
  return (
    <section aria-labelledby="food-recipe" className={DETAIL_SECTION}>
      <h2 id="food-recipe" className="text-base font-semibold">
        Learn the recipe
      </h2>
      <p className="text-sm">
        {skillLine(learnAt, learn.greenAt, learn.greyAt)}
        {cookingSkill === null ? null : <span className="text-muted-foreground"> · {yourSkill(cookingSkill, learnAt)}</span>}
      </p>
      {learn.source === "trainer" ? (
        <div className="space-y-1">
          <p className="text-sm">Any Cooking trainer teaches it — no recipe to buy.</p>
          <Link to="/wow-forever/professions" className={DETAIL_LINK}>
            Find a Cooking trainer in the Cooking guide
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Needs the item {learn.recipe}.</p>
          {hasSources(sources) ? (
            <FoodSourceList sources={sources} faction={faction} zoneId={zoneId} level={level} />
          ) : (
            <p className="text-sm">{unknownSource(learn.recipeItem ?? food.id, "the recipe")}</p>
          )}
        </div>
      )}
    </section>
  );
}
