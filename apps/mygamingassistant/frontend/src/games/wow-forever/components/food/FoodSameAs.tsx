import type { FoodRecord } from "@/games/wow-forever/types/food";

const SHOWN = 3;

/** "Same effect: Tender Wolf Steak, Savory Stag Sliders and 2 more". */
export default function FoodSameAs({ foods }: { foods: readonly FoodRecord[] }) {
  if (foods.length === 0) return null;
  const names = foods.slice(0, SHOWN).map((f) => f.name);
  const more = foods.length - names.length;
  const list = more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ");
  return <p className="text-xs text-muted-foreground">Same effect: {list}</p>;
}
