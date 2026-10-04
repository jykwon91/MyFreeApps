import FoodDirectionsLink from "@/games/wow-forever/components/food/detail/FoodDirectionsLink";
import { placeLabel } from "@/games/wow-forever/food/recipeSources";
import type { ObjectSpot } from "@/games/wow-forever/types/recipeSources";

interface FoodObjectSpotRowProps {
  object: ObjectSpot;
  /** e.g. "Horde territory" — the spot is on the other faction's ground. */
  warning?: string;
  /** Say which container — only needed when several kinds are listed together. */
  named?: boolean;
}

/** "73 in Stranglethorn Vale — Most at The Vile Reef, Stranglethorn Vale · 26.3, 27.9", with directions there. */
export default function FoodObjectSpotRow({ object, warning = "", named = false }: FoodObjectSpotRowProps) {
  const { name, count, spot } = object;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 border-t pt-2 first:border-t-0 first:pt-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm">
          {named ? `${name} · ` : ""}
          {count} in {spot.zoneName}
        </p>
        <p className="text-xs text-muted-foreground">
          Most at {placeLabel(spot)} · {spot.x.toFixed(1)}, {spot.y.toFixed(1)}
          {warning ? <span className="text-red-600 dark:text-red-400"> · {warning}</span> : null}
        </p>
      </div>
      <FoodDirectionsLink spot={spot} name={`${name}, ${spot.zoneName}`} />
    </li>
  );
}
