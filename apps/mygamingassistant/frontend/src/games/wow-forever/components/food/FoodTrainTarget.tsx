import FoodDetailLink from "@/games/wow-forever/components/food/FoodDetailLink";
import FoodChips from "@/games/wow-forever/components/food/FoodChips";
import type { FoodActivity } from "@/games/wow-forever/food/foodActivities";
import { describeBuff, describeRestore } from "@/games/wow-forever/food/foodText";
import type { FoodPick } from "@/games/wow-forever/food/rankFoods";

/** Something better than the top pick that your Cooking skill can't make yet. */
interface FoodTrainTargetProps {
  pick: FoodPick;
  cookingSkill: number;
  activity: FoodActivity;
}

/** What it does, in the terms this activity ranks it by. */
function effect(pick: FoodPick, activity: FoodActivity): string {
  const { food } = pick;
  if (activity === "healing" && food.heal) return describeRestore(food.heal, "health");
  if (food.buff) return describeBuff(food.buff);
  return food.heal ? describeRestore(food.heal, "health") : "";
}

export default function FoodTrainTarget({ pick, cookingSkill, activity }: FoodTrainTargetProps) {
  return (
    <section aria-labelledby="food-train-target" className="rounded-xl border bg-card p-4 space-y-1.5">
      <h2 id="food-train-target" className="text-base font-semibold">
        Worth training for
      </h2>
      <p className="text-sm">
        <span className="font-medium">
          <FoodDetailLink food={pick.food} />
        </span>{" "}
        ({effect(pick, activity)}) is better, but your Cooking is {cookingSkill}.
      </p>
      <FoodChips pick={pick} />
    </section>
  );
}
