import { describeRestores, learnLabel } from "@/games/wow-forever/food/foodText";
import type { FoodPick } from "@/games/wow-forever/food/rankFoods";

const CHIP = "inline-block rounded border px-1.5 py-0.5 text-xs text-muted-foreground";

const KIND_LABEL: Partial<Record<string, string>> = { drink: "Drink", feast: "Feast" };

/** How to learn it, what it heals / restores, and whether it's a drink or a feast. */
export default function FoodChips({ pick }: { pick: FoodPick }) {
  const restores = describeRestores(pick.food);
  const kind = KIND_LABEL[pick.food.kind];
  return (
    <span className="flex flex-wrap gap-1.5">
      <span className={CHIP}>{learnLabel(pick)}</span>
      {kind ? <span className={CHIP}>{kind}</span> : null}
      {restores ? <span className={CHIP}>{restores}</span> : null}
    </span>
  );
}
