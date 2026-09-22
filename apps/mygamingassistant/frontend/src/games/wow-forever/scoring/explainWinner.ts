import { formatStatAmount, isStatKey } from "@/games/wow-forever/data/statKeys";
import type { RankedItem, ScoreRow, ScoreRowKey } from "@/games/wow-forever/scoring/scoreTypes";

const MAX_REASONS = 3;
const MIN_DELTA_POINTS = 0.05;

interface RowDelta {
  key: ScoreRowKey;
  label: string;
  delta: number;
  winnerAmount: number;
  runnerUpAmount: number;
}

function formatAmount(key: ScoreRowKey, amount: number): string {
  if (isStatKey(key)) return formatStatAmount(key, amount);
  return String(Number(amount.toFixed(1)));
}

function scoredRowsByKey(rows: ScoreRow[]): Map<ScoreRowKey, ScoreRow> {
  return new Map(rows.filter((r) => r.points !== null).map((r) => [r.key, r]));
}

function rowDeltas(winner: RankedItem, runnerUp: RankedItem): RowDelta[] {
  const a = scoredRowsByKey(winner.score.rows);
  const b = scoredRowsByKey(runnerUp.score.rows);
  const keys = new Set<ScoreRowKey>([...a.keys(), ...b.keys()]);
  return [...keys].map((key) => {
    const rowA = a.get(key);
    const rowB = b.get(key);
    return {
      key,
      label: (rowA ?? rowB)?.label ?? key,
      delta: (rowA?.points ?? 0) - (rowB?.points ?? 0),
      winnerAmount: rowA?.amount ?? 0,
      runnerUpAmount: rowB?.amount ?? 0,
    };
  });
}

function describe(d: RowDelta): string {
  return `${d.label} (${formatAmount(d.key, d.winnerAmount)} vs ${formatAmount(d.key, d.runnerUpAmount)})`;
}

/**
 * Plain-English reasons the winner beat the runner-up: the biggest point gains,
 * then the biggest thing you'd give up by switching.
 */
export function explainWinner(winner: RankedItem, runnerUp: RankedItem): string[] {
  const margin = winner.score.total - runnerUp.score.total;
  const pct = runnerUp.score.total > 0 ? Math.round((margin / runnerUp.score.total) * 100) : null;
  const marginText = pct === null ? "" : ` (about ${pct}% better)`;
  const lines = [
    `${winner.item.name} scores ${margin.toFixed(1)} points more than ${runnerUp.item.name}${marginText}.`,
  ];

  const deltas = rowDeltas(winner, runnerUp);
  const gains = deltas
    .filter((d) => d.delta > MIN_DELTA_POINTS)
    .sort((x, y) => y.delta - x.delta)
    .slice(0, MAX_REASONS);
  if (gains.length > 0) {
    lines.push(`It's ahead mostly on ${gains.map(describe).join(", ")}.`);
  }

  const losses = deltas.filter((d) => d.delta < -MIN_DELTA_POINTS).sort((x, y) => x.delta - y.delta);
  if (losses.length > 0) {
    lines.push(`You'd give up some ${describe(losses[0])}, but it's worth less to your spec.`);
  }
  return lines;
}
