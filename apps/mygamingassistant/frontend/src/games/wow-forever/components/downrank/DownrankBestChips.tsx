import { Gauge, Zap } from "lucide-react";
import type { DownrankBest } from "@/games/wow-forever/types/downrank/downrankBest";

interface DownrankBestChipsProps {
  rank: number;
  best: DownrankBest;
}

const CHIP = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium";

/** "Most per mana" / "Most per second" on the highlighted ranks — words and an icon, never colour alone. */
export default function DownrankBestChips({ rank, best }: DownrankBestChipsProps) {
  if (best.perMana !== rank && best.perSecond !== rank) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {best.perMana === rank ? (
        <span className={`${CHIP} border-sky-500 text-sky-700 dark:text-sky-300`} data-testid="downrank-best-mana">
          <Gauge className="h-3 w-3" aria-hidden />
          Most per mana
        </span>
      ) : null}
      {best.perSecond === rank ? (
        <span className={`${CHIP} border-amber-500 text-amber-700 dark:text-amber-300`} data-testid="downrank-best-speed">
          <Zap className="h-3 w-3" aria-hidden />
          Most per second
        </span>
      ) : null}
    </span>
  );
}
