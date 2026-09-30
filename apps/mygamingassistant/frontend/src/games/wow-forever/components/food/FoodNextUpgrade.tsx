import type { FoodPick } from "@/games/wow-forever/food/rankFoods";

/** "Next upgrade at level 45: Bear Bruscitti." */
export default function FoodNextUpgrade({ level, pick }: { level: number; pick: FoodPick }) {
  return (
    <p className="text-sm text-muted-foreground">
      Next upgrade at level {level}: <span className="font-medium text-foreground">{pick.food.name}</span>.
    </p>
  );
}
