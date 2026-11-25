import { useMemo } from "react";
import RestoreSection from "@/games/wow-forever/components/food/RestoreSection";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { CONSUMABLES } from "@/games/wow-forever/data/food/consumableData";
import { FOODS } from "@/games/wow-forever/data/food/foodData";
import { reagentSourcesFor } from "@/games/wow-forever/data/food/recipeSourceData";
import { restoreChoices, usesMana } from "@/games/wow-forever/food/restoreOptions";
import { useAuctionPrices } from "@/games/wow-forever/hooks/useAuctionPrices";
import { usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { auctionCopper } from "@/games/wow-forever/prices/auctionPrices";

interface RestoreSectionsProps {
  level: number;
  classId: WowClassId;
}

/** Food, and for a class with mana Drink beside it: a Mage's free one first, then more ways to get it. */
export default function RestoreSections({ level, classId }: RestoreSectionsProps) {
  const [{ faction }] = usePlayerSettings();
  const { prices } = useAuctionPrices();
  const mana = usesMana(classId);
  const { food, drink } = useMemo(() => {
    const input = { level, faction, auctionCopper: (id: number) => auctionCopper(prices, id), sourcesOf: reagentSourcesFor };
    return {
      food: restoreChoices("food", CONSUMABLES, FOODS, input),
      drink: restoreChoices("drink", CONSUMABLES, FOODS, input),
    };
  }, [level, faction, prices]);
  return (
    <div className={mana ? "grid gap-4 md:grid-cols-2" : "grid gap-4"} data-testid="restore-sections">
      <RestoreSection track="food" choices={food} faction={faction} />
      {mana ? <RestoreSection track="drink" choices={drink} faction={faction} /> : null}
    </div>
  );
}
