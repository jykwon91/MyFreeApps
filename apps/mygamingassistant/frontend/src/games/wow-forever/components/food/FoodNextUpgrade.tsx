import FoodDetailLink from "@/games/wow-forever/components/food/FoodDetailLink";
import type { FoodPick } from "@/games/wow-forever/food/rankFoods";

/** "Next upgrade at level 45: Bear Bruscitti." */
export default function FoodNextUpgrade({ level, pick }: { level: number; pick: FoodPick }) {
  return (
    <p className="text-sm text-muted-foreground">
      Next upgrade at level {level}: <span className="font-medium">
        <FoodDetailLink food={pick.food} />
      </span>.
    </p>
  );
}
