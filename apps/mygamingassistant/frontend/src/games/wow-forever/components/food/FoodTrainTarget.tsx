import FoodChips from "@/games/wow-forever/components/food/FoodChips";
import { describeBuff, describeRestore } from "@/games/wow-forever/food/foodText";
import type { FoodPick } from "@/games/wow-forever/food/rankFoods";

/** Something better than the top pick that your Cooking skill can't make yet. */
export default function FoodTrainTarget({ pick, cookingSkill }: { pick: FoodPick; cookingSkill: number }) {
  const { food } = pick;
  let effect = "";
  if (food.buff) effect = describeBuff(food.buff);
  else if (food.heal) effect = describeRestore(food.heal, "health");
  return (
    <section aria-labelledby="food-train-target" className="rounded-xl border bg-card p-4 space-y-1.5">
      <h2 id="food-train-target" className="text-base font-semibold">
        Worth training for
      </h2>
      <p className="text-sm">
        <span className="font-medium">{food.name}</span> ({effect}) is better, but your Cooking is {cookingSkill}.
      </p>
      <FoodChips pick={pick} />
    </section>
  );
}
