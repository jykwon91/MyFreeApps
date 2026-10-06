import { Link, useLocation, useParams } from "react-router-dom";
import FoodEmptyState from "@/games/wow-forever/components/food/FoodEmptyState";
import FoodCookingSpot from "@/games/wow-forever/components/food/detail/FoodCookingSpot";
import FoodEffectSection from "@/games/wow-forever/components/food/detail/FoodEffectSection";
import FoodReagentsSection from "@/games/wow-forever/components/food/detail/FoodReagentsSection";
import FoodRecipeSection from "@/games/wow-forever/components/food/detail/FoodRecipeSection";
import { DETAIL_CHIP, DETAIL_LINK, FACTION_NAME } from "@/games/wow-forever/components/food/detail/detailStyles";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { FOOD_DATA_BUILD, FOODS, TRAINER_SKILLS } from "@/games/wow-forever/data/food/foodData";
import { RECIPE_SOURCE_DATA, recipeSourcesFor } from "@/games/wow-forever/data/food/recipeSourceData";
import { getItSummary } from "@/games/wow-forever/food/recipeSources";
import { useFoodPickerSettings } from "@/games/wow-forever/hooks/useFoodPickerSettings";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import type { FoodKind } from "@/games/wow-forever/types/food";

const KIND_LABEL: Record<FoodKind, string> = { food: "Food", drink: "Drink", feast: "Feast", other: "Novelty" };

/** /wow-forever/food/:foodId — one food: what it does, how to learn it, what goes in it, where to cook it. */
export default function WowFoodDetailPage() {
  const { foodId } = useParams();
  const { search } = useLocation();
  // The level asked about on What should I eat? — maybe someone else's: farm for that level.
  const [{ cookingSkill, level }] = useFoodPickerSettings();
  const [{ faction, zoneId }] = usePlayerSettings();
  const backTo = `/wow-forever/food${search}`;
  const food = FOODS.find((f) => String(f.id) === foodId);

  if (!food) {
    return (
      <main className="p-4 sm:p-8 space-y-6 max-w-4xl">
        <WowPageHeader title="Food not found" subtitle="" backTo={backTo} backLabel="Back to What should I eat?" />
        <FoodEmptyState message="There's no food with that link. Pick one from What should I eat?" />
        <Link to={backTo} className={DETAIL_LINK}>
          Back to What should I eat?
        </Link>
      </main>
    );
  }

  const sources = recipeSourcesFor(food.id);
  const learnAt = food.learn.skill ?? TRAINER_SKILLS[String(food.id)] ?? null;
  return (
    <main className="p-4 sm:p-8 space-y-4 max-w-4xl">
      <WowPageHeader
        title={food.name}
        subtitle={getItSummary(food, sources, faction, zoneId)}
        backTo={backTo}
        backLabel="Back to What should I eat?"
      />
      <p className="flex flex-wrap gap-1.5">
        <span className={DETAIL_CHIP}>{KIND_LABEL[food.kind]}</span>
        <span className={DETAIL_CHIP}>Eat at level {food.level}</span>
      </p>
      <FoodEffectSection food={food} />
      <FoodRecipeSection
        food={food}
        sources={sources}
        learnAt={learnAt}
        cookingSkill={cookingSkill}
        faction={faction}
        zoneId={zoneId}
        level={level}
      />
      <FoodReagentsSection reagents={food.reagents} faction={faction} zoneId={zoneId} level={level} />
      <FoodCookingSpot focus={food.focus} />
      <aside className="rounded-xl border bg-card p-4 space-y-2 text-xs text-muted-foreground">
        <p>
          {FACTION_NAME[faction]} vendors and quests are listed first.{" "}
          <Link to="/wow-forever/map" className="text-primary underline-offset-2 hover:underline">
            Change your faction on the World Map
          </Link>
          .
        </p>
        <p>
          Vendors, quests, drops and drop chances are Classic data ({RECIPE_SOURCE_DATA.split("@")[0]}) and may differ in
          Forever. The recipe, ingredients and effect are read from the Forever beta client (build {FOOD_DATA_BUILD}).
        </p>
      </aside>
    </main>
  );
}
