import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import type { FoodFocus } from "@/games/wow-forever/types/food";

const WHERE_TO_COOK: Record<FoodFocus | "none", string> = {
  "Cooking Fire":
    "Next to a cooking fire. In Forever the Stormwind and Orgrimmar city fires no longer count; outside a capital, place a Basic Campfire (Cooking teaches it).",
  "Iron Oven": "At an Iron Oven — new in Forever. Where the ovens are isn't published yet.",
  none: "Anywhere — no fire needed.",
};

/** The Forever client says what each recipe must be cooked at. */
export default function FoodCookingSpot({ focus }: { focus: FoodFocus | null }) {
  return (
    <section aria-labelledby="food-cook-at" className={DETAIL_SECTION}>
      <h2 id="food-cook-at" className="text-base font-semibold">
        Where to cook it
      </h2>
      <p className="text-sm">{WHERE_TO_COOK[focus ?? "none"]}</p>
    </section>
  );
}
