import CraftMatItem from "@/games/wow-forever/components/crafting/CraftMatItem";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import { formatPrice, type PriceBook } from "@/games/wow-forever/crafting/matPrices";
import type { CraftReagent } from "@/games/wow-forever/types/crafting";

interface CraftReagentsProps {
  reagents: readonly CraftReagent[];
  place: CraftPlace;
  professionLabel: string;
  /** How many times the route makes it: the counts become totals ("24× Strange Dust · 1 per craft"). Without it, per craft. */
  crafts?: number;
  /** The prices the route's costs use, for "60c each". Null or absent = no prices shown. */
  priceBook?: PriceBook | null;
}

/** " · 60c each" — what one costs at the price the route uses; nothing when it has no price. */
function unitPriceText(reagent: CraftReagent, priceBook: PriceBook | null): string {
  const price = priceBook?.item(reagent.id, reagent.name).price;
  if (price === undefined) return "";
  return ` · ${formatPrice(price)} each`;
}

/** "2× Bolt of Linen Cloth · 20c each" — per craft, or in all for `crafts` makes; each opens to where to get it. */
export default function CraftReagents({ reagents, place, professionLabel, crafts = 1, priceBook = null }: CraftReagentsProps) {
  const total = crafts > 1;
  return (
    <ul
      className="text-sm"
      aria-label={`Materials ${total ? "in all" : "per craft"} — open one for every place to get it`}
    >
      {reagents.map((r) => (
        <CraftMatItem
          key={r.id}
          itemId={r.id}
          label={
            total ? (
              <>
                <span className="font-semibold tabular-nums">{r.count * crafts}×</span> {r.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {r.count} per craft{unitPriceText(r, priceBook)}
                </span>
              </>
            ) : (
              <>
                {r.count}× {r.name}
                <span className="text-muted-foreground">{unitPriceText(r, priceBook)}</span>
              </>
            )
          }
          place={place}
          professionLabel={professionLabel}
          summaryParts={1}
        />
      ))}
    </ul>
  );
}
