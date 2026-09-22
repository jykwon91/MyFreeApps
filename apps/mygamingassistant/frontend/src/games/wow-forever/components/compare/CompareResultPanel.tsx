import { Trophy } from "lucide-react";
import { AlertBox } from "@platform/ui";
import RankedItemRow from "@/games/wow-forever/components/compare/RankedItemRow";
import ScoreBreakdownTable from "@/games/wow-forever/components/compare/ScoreBreakdownTable";
import type { CompareResult } from "@/games/wow-forever/scoring/scoreTypes";

interface CompareResultPanelProps {
  result: CompareResult;
  weightsLabel: string;
}

export default function CompareResultPanel({ result, weightsLabel }: CompareResultPanelProps) {
  if (!result.ready) {
    return (
      <section aria-label="Result" className="rounded-xl border border-dashed bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Add stats to at least two items to see which one is better for you.
        </p>
      </section>
    );
  }

  let headline = "It's a tie";
  if (result.winner) headline = `${result.winner.name} is the better pick`;

  return (
    <section aria-label="Result" aria-live="polite" className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-start gap-3">
        <Trophy className="h-6 w-6 text-primary shrink-0" aria-hidden />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{headline}</h2>
          {result.why.map((line) => (
            <p key={line} className="text-sm">
              {line}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">Weights: {weightsLabel} (approximate)</p>
        </div>
      </div>
      {result.warnings.map((w) => (
        <AlertBox key={w} variant="warning">
          {w}
        </AlertBox>
      ))}
      {result.notes.map((n) => (
        <AlertBox key={n} variant="info">
          {n}
        </AlertBox>
      ))}
      <ol className="space-y-3">
        {result.ranked.map((entry, i) => (
          <RankedItemRow key={entry.item.id} entry={entry} rank={i + 1} />
        ))}
      </ol>
      <ScoreBreakdownTable ranked={result.ranked} breakdown={result.breakdown} />
    </section>
  );
}
