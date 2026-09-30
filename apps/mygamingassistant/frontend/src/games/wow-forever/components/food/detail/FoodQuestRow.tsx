import FoodDirectionsLink from "@/games/wow-forever/components/food/detail/FoodDirectionsLink";
import { placeLabel } from "@/games/wow-forever/food/recipeSources";
import type { QuestSource } from "@/games/wow-forever/types/recipeSources";

/** "“Westfall Stew” · level 11 quest — from Salma Saldean, Saldean's Farm, Westfall". */
export default function FoodQuestRow({ quest }: { quest: QuestSource }) {
  const giver = quest.givers[0];
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm">
          <span className="font-medium">“{quest.title}”</span>
          <span className="text-muted-foreground"> · level {quest.level} quest</span>
        </p>
        {giver ? (
          <p className="text-xs text-muted-foreground">
            From {giver.name}, {placeLabel(giver)}
          </p>
        ) : null}
      </div>
      {giver ? <FoodDirectionsLink spot={giver} name={giver.name} /> : null}
    </li>
  );
}
