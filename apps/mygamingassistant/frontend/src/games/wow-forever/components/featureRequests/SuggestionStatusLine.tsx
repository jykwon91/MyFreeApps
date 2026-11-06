import { useNow } from "@/games/wow-forever/hooks/useNow";
import {
  SUBMIT_CANCEL_AFTER_MS,
  SUBMIT_STAGE,
  SUBMIT_STAGE_LINE,
  SUBMIT_TICK_MS,
} from "@/games/wow-forever/data/featureRequests/suggestCopy";
import { submitStageAt } from "@/games/wow-forever/lib/featureRequests/submitStage";

interface SuggestionStatusLineProps {
  /** When the send started (ms epoch). */
  since: number;
  onCancel: () => void;
}

/**
 * While an idea is read: a status line that moves on as the wait grows ("Working out what you mean…",
 * then "Checking if someone already asked…"), and a Cancel link once it's been a few seconds.
 */
export default function SuggestionStatusLine({ since, onCancel }: SuggestionStatusLineProps) {
  const now = useNow(SUBMIT_TICK_MS);
  const elapsed = Math.max(0, now - since);
  const stage = submitStageAt(elapsed);
  return (
    <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-sm text-muted-foreground">
        {/* The button already says "Reading your idea…" for the first seconds. */}
        {stage === SUBMIT_STAGE.reading ? null : SUBMIT_STAGE_LINE[stage]}
      </p>
      {elapsed >= SUBMIT_CANCEL_AFTER_MS ? (
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[44px] px-2 text-sm text-primary underline underline-offset-2"
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}
