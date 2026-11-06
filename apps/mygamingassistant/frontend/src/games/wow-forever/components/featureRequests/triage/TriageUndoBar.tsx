import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import type { PendingDelayedAction } from "@/games/wow-forever/types/featureRequests/triage/pendingDelayedAction";

interface TriageUndoBarProps {
  pending: PendingDelayedAction;
  onUndo: () => void;
}

/** "Approved: <title>" with Undo while it waits; "Saving…" once it's being sent (too late to undo). */
export default function TriageUndoBar({ pending, onUndo }: TriageUndoBarProps) {
  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2" data-testid="triage-undo-bar">
      <p className="text-sm [overflow-wrap:anywhere]">
        <bdi>{pending.label}</bdi>
      </p>
      {pending.phase === "running" ? (
        <span className="text-sm text-muted-foreground">{TRIAGE_COPY.saving}</span>
      ) : (
        <button type="button" onClick={onUndo} className={TRIAGE_SECONDARY_BUTTON}>
          {TRIAGE_COPY.undo}
        </button>
      )}
    </div>
  );
}
