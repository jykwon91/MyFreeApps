import FoodChips from "@/games/wow-forever/components/food/FoodChips";
import FoodSameAs from "@/games/wow-forever/components/food/FoodSameAs";
import type { FoodActivity } from "@/games/wow-forever/food/foodActivities";
import { whyLine } from "@/games/wow-forever/food/foodText";
import type { FoodPick } from "@/games/wow-forever/food/rankFoods";

interface FoodTopPickProps {
  pick: FoodPick;
  activity: FoodActivity;
  /** "a level 35 Warrior" — who it's best for. */
  who: string;
}

/** The answer: what to cook, and one line on why. */
export default function FoodTopPick({ pick, activity, who }: FoodTopPickProps) {
  return (
    <section aria-labelledby="food-top-pick" className="rounded-xl border-2 border-primary bg-card p-5 space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-primary">Best pick</p>
      <h2 id="food-top-pick" className="text-xl font-semibold">
        {pick.food.name}
      </h2>
      <p className="text-sm">{whyLine(pick, activity, who)}</p>
      <FoodChips pick={pick} />
      <FoodSameAs foods={pick.sameAs} />
    </section>
  );
}
