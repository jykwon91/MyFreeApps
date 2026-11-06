import { AlertBox } from "@platform/ui";
import FocusHeading from "@/games/wow-forever/components/shared/FocusHeading";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import {
  SUBMIT_PROBLEM,
  SUBMIT_PROBLEM_HEADING,
  SUBMIT_PROBLEM_MESSAGE,
  SUBMIT_PROBLEM_VARIANT,
  SUBMIT_TICK_MS,
} from "@/games/wow-forever/data/featureRequests/suggestCopy";
import { comeBackLabel } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import type { SubmitFailure } from "@/games/wow-forever/types/featureRequests/submitFailure";

interface SuggestionNoticeProps {
  failure: SubmitFailure;
  /** When the rate limit lifts (ms epoch), for the countdown; null when unknown. */
  blockedUntil: number | null;
  /** Retry (network / server problems) — the same text, a fresh human check. */
  onRetry: (() => void) | null;
  retryDisabled: boolean;
  /** "Edit and try again" after a rejection: back into the text box. */
  onEdit: () => void;
}

const MS_PER_SECOND = 1000;

/** Why the last send didn't come back with a story — one neutral message and what to do next. The draft is kept. */
export default function SuggestionNotice({ failure, blockedUntil, onRetry, retryDisabled, onEdit }: SuggestionNoticeProps) {
  const now = useNow(SUBMIT_TICK_MS);
  const secondsLeft = blockedUntil === null ? null : Math.ceil((blockedUntil - now) / MS_PER_SECOND);
  const isRateLimited = failure.kind === SUBMIT_PROBLEM.rateLimited;
  const canRetry = failure.kind === SUBMIT_PROBLEM.network || failure.kind === SUBMIT_PROBLEM.server;

  return (
    <AlertBox variant={SUBMIT_PROBLEM_VARIANT[failure.kind]}>
      <div className="space-y-2" aria-live="polite">
        <FocusHeading className="text-sm font-semibold focus:outline-none">{SUBMIT_PROBLEM_HEADING[failure.kind]}</FocusHeading>
        <p>
          {SUBMIT_PROBLEM_MESSAGE[failure.kind]}
          {isRateLimited ? ` ${comeBackLabel(secondsLeft)}` : null}
        </p>
        {failure.kind === SUBMIT_PROBLEM.rejected ? (
          <button type="button" onClick={onEdit} className="min-h-[44px] font-medium underline underline-offset-2">
            Edit and try again
          </button>
        ) : null}
        {canRetry && onRetry !== null ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            className="min-h-[44px] font-medium underline underline-offset-2 disabled:opacity-50"
          >
            Retry
          </button>
        ) : null}
      </div>
    </AlertBox>
  );
}
