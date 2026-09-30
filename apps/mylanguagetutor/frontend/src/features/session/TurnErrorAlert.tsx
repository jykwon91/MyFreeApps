import { AlertBox } from "@platform/ui";
import { turnErrorCopy } from "@/features/session/errorCopy";
import type { TurnFailure } from "@/types/session/turn-failure";

interface TurnErrorAlertProps {
  failure: TurnFailure;
  onRetry: () => void;
  onDismiss: () => void;
}

const ACTION_CLASS = "min-h-[44px] rounded-md px-3 font-medium underline";

/** A failed turn. "Try again" resubmits exactly what the learner said. */
export default function TurnErrorAlert({ failure, onRetry, onDismiss }: TurnErrorAlertProps) {
  return (
    <AlertBox variant="error">
      <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
        <span>{turnErrorCopy(failure.code)}</span>
        <div className="flex gap-1">
          {failure.retryable && (
            <button type="button" onClick={onRetry} className={ACTION_CLASS}>
              Try again
            </button>
          )}
          <button type="button" onClick={onDismiss} className={ACTION_CLASS}>
            Dismiss
          </button>
        </div>
      </div>
    </AlertBox>
  );
}
