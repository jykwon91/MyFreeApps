import ItemNameList from "@/games/wow-forever/components/shared/ItemNameList";
import type { FoodRecord } from "@/games/wow-forever/types/food";

const SHOWN = 3;

/** "Same effect: Tender Wolf Steak, Savory Stag Sliders and 2 more". */
export default function FoodSameAs({ foods }: { foods: readonly FoodRecord[] }) {
  if (foods.length === 0) return null;
  const shown = foods.slice(0, SHOWN);
  const more = foods.length - shown.length;
  return (
    <p className="text-xs text-muted-foreground">
      Same effect: <ItemNameList items={shown} />
      {more > 0 ? ` and ${more} more` : null}
    </p>
  );
}
