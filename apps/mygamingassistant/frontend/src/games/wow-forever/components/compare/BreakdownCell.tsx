import { formatStatAmount, isStatKey } from "@/games/wow-forever/data/statKeys";
import type { ScoreRow } from "@/games/wow-forever/scoring/scoreTypes";

function amountText(row: ScoreRow): string {
  if (isStatKey(row.key)) return formatStatAmount(row.key, row.amount);
  return String(Number(row.amount.toFixed(1)));
}

export default function BreakdownCell({ row }: { row: ScoreRow | null }) {
  if (row === null) {
    return <td className="p-2 text-muted-foreground">—</td>;
  }
  if (row.points === null) {
    return (
      <td className="p-2">
        {amountText(row)} <span className="text-xs text-muted-foreground">(not scored)</span>
      </td>
    );
  }
  const capped = row.countedAmount < row.amount;
  return (
    <td className="p-2">
      {amountText(row)} <span className="text-xs text-muted-foreground">= {row.points.toFixed(1)} pts</span>
      {capped ? <span className="block text-xs text-orange-700 dark:text-orange-300">partly over the hit cap</span> : null}
    </td>
  );
}
