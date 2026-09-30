import { useState } from "react";
import { Button } from "@platform/ui";
import FoodRunnerUpRow from "@/games/wow-forever/components/food/FoodRunnerUpRow";
import type { FoodActivity } from "@/games/wow-forever/food/foodActivities";
import type { FoodPick } from "@/games/wow-forever/food/rankFoods";

const FIRST = 3;
const MORE = 8;

/** The next-best foods — 3 at first, up to 8 on request. */
export default function FoodRunnersUp({ picks, activity }: { picks: readonly FoodPick[]; activity: FoodActivity }) {
  const [expanded, setExpanded] = useState(false);
  if (picks.length === 0) return null;
  const shown = picks.slice(0, expanded ? MORE : FIRST);
  const canExpand = !expanded && picks.length > FIRST;
  return (
    <section aria-labelledby="food-runners-up" className="space-y-2">
      <h2 id="food-runners-up" className="text-base font-semibold">
        Also good
      </h2>
      <ol className="space-y-2">
        {shown.map((p) => (
          <FoodRunnerUpRow key={p.food.id} pick={p} activity={activity} />
        ))}
      </ol>
      {canExpand ? (
        <Button variant="secondary" onClick={() => setExpanded(true)}>
          Show more
        </Button>
      ) : null}
    </section>
  );
}
