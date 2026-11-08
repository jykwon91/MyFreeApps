import clsx from "clsx";
import DownrankBestChips from "@/games/wow-forever/components/downrank/DownrankBestChips";
import DownrankRankLabel from "@/games/wow-forever/components/downrank/DownrankRankLabel";
import { formatAmount, formatCast, formatRate, formatShare } from "@/games/wow-forever/lib/downrank/downrankFormat";
import type { DownrankBest } from "@/games/wow-forever/types/downrank/downrankBest";
import type { DownrankRow } from "@/games/wow-forever/types/downrank/downrankRow";

interface DownrankRankCardsProps {
  rows: readonly DownrankRow[];
  best: DownrankBest;
  amountWord: string;
}

const TERM = "text-xs text-muted-foreground";
const VALUE = "tabular-nums";

/** Every rank as a card, below `md` — the table's columns as label / value pairs. */
export default function DownrankRankCards({ rows, best, amountWord }: DownrankRankCardsProps) {
  return (
    <ul className="md:hidden space-y-3" aria-label="Every rank, worked out for you">
      {rows.map((row) => {
        const isBest = best.perMana === row.rank.rank || best.perSecond === row.rank.rank;
        return (
          <li
            key={row.rank.spell}
            data-testid="downrank-card"
            data-rank={row.rank.rank}
            className={clsx("rounded-xl border bg-card p-3 space-y-2", !row.learnable && "opacity-60", isBest && "border-foreground/40")}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <DownrankRankLabel row={row} />
              <DownrankBestChips rank={row.rank.rank} best={best} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <div>
                <dt className={TERM}>Total {amountWord}</dt>
                <dd className={clsx(VALUE, "font-medium")}>{formatAmount(row.amount)}</dd>
              </div>
              <div>
                <dt className={TERM}>Mana</dt>
                <dd className={VALUE}>{formatAmount(row.mana)}</dd>
              </div>
              <div>
                <dt className={TERM}>Per mana</dt>
                <dd className={VALUE}>{formatRate(row.perMana, 2)}</dd>
              </div>
              <div>
                <dt className={TERM}>Per second</dt>
                <dd className={VALUE}>{formatRate(row.perSecond, 1)}</dd>
              </div>
              <div>
                <dt className={TERM}>Base {amountWord}</dt>
                <dd className={VALUE}>
                  {formatAmount(row.baseMin)}–{formatAmount(row.baseMax)} (avg {formatAmount(row.baseAvg)})
                </dd>
              </div>
              <div>
                <dt className={TERM}>Cast</dt>
                <dd>{formatCast(row.rank)}</dd>
              </div>
              <div className="col-span-2">
                <dt className={TERM}>From your bonus</dt>
                <dd className={VALUE}>
                  +{formatAmount(row.bonusAdded)} ({formatShare(row.effectiveCoefficient)} of it)
                </dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
