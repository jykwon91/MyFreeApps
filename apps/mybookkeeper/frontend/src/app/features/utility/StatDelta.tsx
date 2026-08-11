import type { StatDirection } from "@/shared/types/utility/stat-direction";

export interface StatDeltaProps {
  direction: StatDirection;
  /** Already-formatted movement — "5.77¢ less". */
  delta: string;
}

const MARK: Record<StatDirection, string> = {
  better: "▼",
  worse: "▲",
  same: "—",
  neutral: "—",
};

const TONE: Record<StatDirection, string> = {
  better: "text-green-700 dark:text-green-300",
  worse: "text-red-700 dark:text-red-300",
  same: "text-muted-foreground",
  neutral: "text-muted-foreground",
};

/**
 * The movement of one stat against the plan the property holds today.
 *
 * Three redundant channels carry the meaning: the triangle's orientation, the
 * word ("less"/"more") inside the delta text, and colour. Colour is
 * reinforcement only — the row still reads correctly in greyscale, which is
 * the test that matters for a red/green pairing.
 *
 * Down is good here: every stat that carries a delta is a cost, so a falling
 * number is the improvement.
 */
export default function StatDelta({ direction, delta }: StatDeltaProps) {
  return (
    <span className={`text-xs font-medium inline-flex items-center gap-1 ${TONE[direction]}`}>
      <span aria-hidden="true">{MARK[direction]}</span>
      {delta}
    </span>
  );
}
