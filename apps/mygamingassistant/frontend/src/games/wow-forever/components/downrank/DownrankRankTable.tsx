import clsx from "clsx";
import DownrankBestChips from "@/games/wow-forever/components/downrank/DownrankBestChips";
import DownrankRankLabel from "@/games/wow-forever/components/downrank/DownrankRankLabel";
import { formatAmount, formatCast, formatRate, formatShare } from "@/games/wow-forever/lib/downrank/downrankFormat";
import type { DownrankBest } from "@/games/wow-forever/types/downrank/downrankBest";
import type { DownrankRow } from "@/games/wow-forever/types/downrank/downrankRow";

interface DownrankRankTableProps {
  rows: readonly DownrankRow[];
  best: DownrankBest;
  amountWord: string;
}

const HEAD = "px-3 py-2 text-left font-medium";
const CELL = "px-3 py-2 align-top tabular-nums";

/** Every rank in one table, from `md` up (phones get `DownrankRankCards`). */
export default function DownrankRankTable({ rows, best, amountWord }: DownrankRankTableProps) {
  return (
    <div className="hidden md:block overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <caption className="sr-only">Every rank, worked out for you</caption>
        <thead className="border-b text-xs text-muted-foreground">
          <tr>
            <th scope="col" className={HEAD}>Rank</th>
            <th scope="col" className={HEAD}>Mana</th>
            <th scope="col" className={HEAD}>Base {amountWord}</th>
            <th scope="col" className={HEAD}>Cast</th>
            <th scope="col" className={HEAD}>From your bonus</th>
            <th scope="col" className={HEAD}>Total {amountWord}</th>
            <th scope="col" className={HEAD}>Per mana</th>
            <th scope="col" className={HEAD}>Per second</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isBest = best.perMana === row.rank.rank || best.perSecond === row.rank.rank;
            return (
              <tr
                key={row.rank.spell}
                data-testid="downrank-row"
                data-rank={row.rank.rank}
                className={clsx("border-b last:border-b-0", !row.learnable && "text-muted-foreground opacity-60", isBest && "bg-muted/40")}
              >
                <th scope="row" className={clsx(CELL, "text-left font-normal")}>
                  <span className="flex flex-col gap-1">
                    <DownrankRankLabel row={row} />
                    <DownrankBestChips rank={row.rank.rank} best={best} />
                  </span>
                </th>
                <td className={CELL}>{formatAmount(row.mana)}</td>
                <td className={CELL}>
                  {formatAmount(row.baseMin)}–{formatAmount(row.baseMax)}
                  <span className="block text-xs text-muted-foreground">avg {formatAmount(row.baseAvg)}</span>
                </td>
                <td className={CELL}>{formatCast(row.rank)}</td>
                <td className={CELL}>
                  +{formatAmount(row.bonusAdded)}
                  <span className="block text-xs text-muted-foreground">{formatShare(row.effectiveCoefficient)} of it</span>
                </td>
                <td className={clsx(CELL, "font-medium")}>{formatAmount(row.amount)}</td>
                <td className={CELL} data-testid="downrank-per-mana">{formatRate(row.perMana, 2)}</td>
                <td className={CELL}>{formatRate(row.perSecond, 1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
