import { AlertBox, Button } from "@platform/ui";
import { ASK_COPY } from "@/games/wow-forever/data/ask/askCopy";
import { ASK_FAILURE_ACTION, ASK_FAILURE_ACTIONS } from "@/games/wow-forever/data/ask/askFailureActions";
import { ASK_FAILURE } from "@/games/wow-forever/data/ask/askFailureKinds";
import { useCountdown } from "@/games/wow-forever/hooks/ask/useCountdown";
import type { AskFailure } from "@/games/wow-forever/types/ask/askFailure";

interface AskErrorNoticeProps {
  failure: AskFailure;
  onRetry: () => void;
  onNewChat: () => void;
}

/**
 * Why the last question didn't get an answer, and what to do: Try again
 * (held back while the server's Retry-After counts down), New chat when the
 * chat has expired, or nothing for the daily cap. Remount it per failure.
 */
export default function AskErrorNotice({ failure, onRetry, onNewChat }: AskErrorNoticeProps) {
  const waiting = failure.kind === ASK_FAILURE.dailyLimit ? null : failure.retryAfterSeconds;
  const left = useCountdown(waiting);
  const action = ASK_FAILURE_ACTIONS[failure.kind];
  return (
    <div role="alert" data-testid="ask-error">
      <AlertBox variant={failure.kind === ASK_FAILURE.dailyLimit ? "info" : "error"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p>{ASK_COPY.failure[failure.kind]}</p>
          {action === ASK_FAILURE_ACTION.retry ? (
            <Button variant="secondary" size="sm" onClick={onRetry} disabled={left > 0}>
              {left > 0 ? ASK_COPY.retryIn(left) : ASK_COPY.retry}
            </Button>
          ) : null}
          {action === ASK_FAILURE_ACTION.newChat ? (
            <Button variant="secondary" size="sm" onClick={onNewChat}>
              {ASK_COPY.newChat}
            </Button>
          ) : null}
        </div>
      </AlertBox>
    </div>
  );
}
