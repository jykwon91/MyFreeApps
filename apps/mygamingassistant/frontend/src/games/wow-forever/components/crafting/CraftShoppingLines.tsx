import CraftMatItem from "@/games/wow-forever/components/crafting/CraftMatItem";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import { formatCost } from "@/games/wow-forever/crafting/matPrices";
import type { ShoppingLine } from "@/games/wow-forever/types/crafting";

interface CraftShoppingLinesProps {
  title: string;
  lines: readonly ShoppingLine[];
  place: CraftPlace;
  professionLabel: string;
  /** Copper for the whole line, when you've priced it. */
  costOf?: (line: ShoppingLine) => number | undefined;
}

function LineCost({ cost }: { cost: number | undefined }) {
  if (cost === undefined) return null;
  return <span className="ml-2 text-muted-foreground tabular-nums">({formatCost(cost)})</span>;
}

/** One group of the shopping list: count and item, the easiest way to get it under each; two columns on wide screens. */
export default function CraftShoppingLines({ title, lines, place, professionLabel, costOf }: CraftShoppingLinesProps) {
  if (!lines.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{title}</p>
      <ul className="grid gap-x-6 sm:grid-cols-2 text-sm">
        {lines.map((l) => (
          <CraftMatItem
            key={l.id}
            itemId={l.id}
            label={
              <>
                <span className="tabular-nums font-medium">{l.count}</span> {l.name}
                <LineCost cost={costOf ? costOf(l) : undefined} />
              </>
            }
            place={place}
            professionLabel={professionLabel}
          />
        ))}
      </ul>
    </div>
  );
}
