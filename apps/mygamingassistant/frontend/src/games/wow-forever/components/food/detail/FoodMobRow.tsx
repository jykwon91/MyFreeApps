import FoodDirectionsLink from "@/games/wow-forever/components/food/detail/FoodDirectionsLink";
import { describeMob, placeLabel } from "@/games/wow-forever/food/recipeSources";
import type { DropMob } from "@/games/wow-forever/types/recipeSources";

interface FoodMobRowProps {
  mob: DropMob;
  /** e.g. "Horde territory" — the spot is on the other faction's ground. */
  warning?: string;
  /** e.g. "Too high for level 20" — shown after the chance. */
  note?: string;
}

/** "Goretusk (level 14–15) · 39.2% — Moonbrook, Westfall · 45.6, 57.4", with directions there. */
export default function FoodMobRow({ mob, warning = "", note = "" }: FoodMobRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 border-t pt-2 first:border-t-0 first:pt-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm">
          {describeMob(mob)}
          {note ? <span className="text-muted-foreground"> · {note}</span> : null}
        </p>
        {mob.spot ? (
          <p className="text-xs text-muted-foreground">
            {placeLabel(mob.spot)} · {mob.spot.x.toFixed(1)}, {mob.spot.y.toFixed(1)}
            {warning ? <span className="text-red-600 dark:text-red-400"> · {warning}</span> : null}
          </p>
        ) : null}
      </div>
      {mob.spot ? <FoodDirectionsLink spot={mob.spot} name={mob.name} /> : null}
    </li>
  );
}
