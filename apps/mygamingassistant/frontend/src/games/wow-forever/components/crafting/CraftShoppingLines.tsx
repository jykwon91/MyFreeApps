import CraftMatItem from "@/games/wow-forever/components/crafting/CraftMatItem";
import type { CraftPlace } from "@/games/wow-forever/components/crafting/CraftLearnLine";
import type { ShoppingLine } from "@/games/wow-forever/types/crafting";

interface CraftShoppingLinesProps {
  title: string;
  lines: readonly ShoppingLine[];
  place: CraftPlace;
  professionLabel: string;
}

/** One group of the shopping list: count and item, the easiest way to get it under each; two columns on wide screens. */
export default function CraftShoppingLines({ title, lines, place, professionLabel }: CraftShoppingLinesProps) {
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
