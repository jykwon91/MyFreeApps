import FoodDirectionsLink from "@/games/wow-forever/components/food/detail/FoodDirectionsLink";
import { placeLabel } from "@/games/wow-forever/food/recipeSources";
import { questLevelText } from "@/games/wow-forever/lib/itemPages/describeItem";
import type { ItemQuest } from "@/games/wow-forever/types/itemPages/itemQuest";

/** "“The Emperor's Fall” · level 60 quest · pick up from level 54 — from …". */
export default function ItemQuestRow({ quest }: { quest: ItemQuest }) {
  const giver = quest.givers[0];
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm">
          <span className="font-medium">“{quest.title}”</span>
          <span className="text-muted-foreground"> · {questLevelText(quest)}</span>
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
