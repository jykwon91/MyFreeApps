import FoodChips from "@/games/wow-forever/components/food/FoodChips";
import FoodSameAs from "@/games/wow-forever/components/food/FoodSameAs";
import type { FoodActivity } from "@/games/wow-forever/food/foodActivities";
import { describeBuff, describeRestore } from "@/games/wow-forever/food/foodText";
import type { FoodPick } from "@/games/wow-forever/food/rankFoods";

/** What the food does, in the terms this activity ranks it by. */
function effect(pick: FoodPick, activity: FoodActivity): string {
  if (activity === "healing" && pick.food.heal) return describeRestore(pick.food.heal, "health");
  return pick.food.buff ? describeBuff(pick.food.buff) : "";
}

export default function FoodRunnerUpRow({ pick, activity }: { pick: FoodPick; activity: FoodActivity }) {
  return (
    <li className="rounded-lg border bg-card p-3 space-y-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{pick.food.name}</span>
        <span className="text-sm text-muted-foreground">{effect(pick, activity)}</span>
      </p>
      <FoodChips pick={pick} />
      <FoodSameAs foods={pick.sameAs} />
    </li>
  );
}
