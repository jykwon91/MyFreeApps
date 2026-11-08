import { Loader2 } from "lucide-react";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_PHASE } from "@/games/wow-forever/data/ask/askPhases";
import { useStillWorking } from "@/games/wow-forever/hooks/ask/useStillWorking";
import type { AskPhase } from "@/games/wow-forever/types/ask/askPhase";

interface AskStepLinesProps {
  phase: AskPhase;
  steps: readonly string[];
  busySince: number | null;
  onCancel: () => void;
}

function phaseLine(phase: AskPhase, steps: readonly string[]): string | null {
  if (phase === ASK_PHASE.checking) return ASK_COPY.checking;
  if (phase === ASK_PHASE.thinking) return ASK_COPY.thinking;
  return steps.length ? null : ASK_COPY.thinking;
}

/** What the answer being worked on is doing right now, "Still working…" when it's slow, and Cancel. */
export default function AskStepLines({ phase, steps, busySince, onCancel }: AskStepLinesProps) {
  const late = useStillWorking(busySince);
  const current = phaseLine(phase, steps);
  return (
    <div className="space-y-1 text-sm text-muted-foreground" data-testid="ask-steps">
      <ul aria-live="polite" className="space-y-1">
        {steps.map((step, i) => (
          <li key={`${i}-${step}`}>{step}</li>
        ))}
        {current ? (
          <li className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {current}
          </li>
        ) : null}
        {late ? <li>{ASK_COPY.stillWorking}</li> : null}
      </ul>
      <button
        type="button"
        onClick={onCancel}
        className="min-h-[44px] rounded-md px-3 text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {ASK_COPY.cancel}
      </button>
    </div>
  );
}
