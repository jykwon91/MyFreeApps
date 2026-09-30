import UnconfirmedChip from "@/games/wow-forever/components/professions/UnconfirmedChip";
import { DETAIL_SECTION } from "@/games/wow-forever/components/food/detail/detailStyles";
import { describeBuff, describeRestores } from "@/games/wow-forever/food/foodText";
import type { FoodRecord } from "@/games/wow-forever/types/food";

/** What eating it does, then the client's own tooltip. */
export default function FoodEffectSection({ food }: { food: FoodRecord }) {
  const restores = describeRestores(food);
  return (
    <section aria-labelledby="food-effect" className={DETAIL_SECTION}>
      <h2 id="food-effect" className="text-base font-semibold">
        What it does
      </h2>
      <ul className="list-disc pl-5 text-sm space-y-1">
        {restores ? <li>{restores}</li> : null}
        {food.buff ? (
          <li>
            Well Fed: {describeBuff(food.buff)} for {food.buff.duration}
          </li>
        ) : null}
        {food.xpBonusPct ? (
          <li>
            +{food.xpBonusPct}% XP from kills while Well Fed <UnconfirmedChip />
          </li>
        ) : null}
      </ul>
      {food.tooltip ? <p className="text-xs italic text-muted-foreground">“{food.tooltip}”</p> : null}
    </section>
  );
}
