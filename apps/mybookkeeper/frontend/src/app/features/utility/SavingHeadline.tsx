import { formatWholeDollars } from "@/shared/lib/utility-offer-format";

export interface SavingHeadlineProps {
  savingCents: number | null;
  /** The largest saving on offer at this property — the bar's full width. */
  maxSavingCents: number;
  /** True when the figure only holds inside a narrow band of usage. */
  isConditional: boolean;
}

function barPercent(savingCents: number, maxSavingCents: number): number {
  if (maxSavingCents <= 0) return 0;
  // A floor so the weakest offer still draws something to compare against.
  return Math.max(6, Math.round((savingCents / maxSavingCents) * 100));
}

/**
 * The number the whole card exists to deliver.
 *
 * Set large and first because it is the answer to "is this an improvement" —
 * everything below it explains the answer rather than competing with it. The
 * bar underneath turns a column of similar dollar figures into a shape the eye
 * can rank without reading, which is what separates a $619 offer from a $547
 * one at a glance.
 */
export default function SavingHeadline({
  savingCents,
  maxSavingCents,
  isConditional,
}: SavingHeadlineProps) {
  if (savingCents === null || savingCents <= 0) return null;

  // A bill-credit plan posts the biggest number on the board while only holding
  // it near 1,000 kWh. Printed in the same green as an honest saving it wins the
  // page by size alone, so the figure itself carries the qualification — the
  // caveat sentence below is too late if the eye has already picked a winner.
  const numberTone = isConditional
    ? "text-amber-700 dark:text-amber-300"
    : "text-green-700 dark:text-green-300";
  const barTone = isConditional
    ? "bg-amber-500 dark:bg-amber-400"
    : "bg-green-600 dark:bg-green-400";

  return (
    <div className="mt-2">
      <p className="flex items-baseline gap-1.5 flex-wrap">
        <span className={`text-2xl font-semibold tabular-nums ${numberTone}`}>
          {formatWholeDollars(savingCents)}
        </span>
        <span className="text-xs text-muted-foreground">
          {isConditional ? "less per year — but only near 1,000 kWh" : "less per year than now"}
        </span>
      </p>
      <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full ${barTone}`}
          style={{ width: `${barPercent(savingCents, maxSavingCents)}%` }}
        />
      </div>
    </div>
  );
}
