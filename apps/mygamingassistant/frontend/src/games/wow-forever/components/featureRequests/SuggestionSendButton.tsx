import { LoadingButton } from "@platform/ui";
import { SUGGEST_COPY } from "@/games/wow-forever/data/featureRequests/suggestCopy";

interface SuggestionSendButtonProps {
  label: string;
  submitting: boolean;
  /** Waiting for the human check to hand over a token. */
  waitingForCheck: boolean;
  /** Rate limited, or nothing to send. */
  blocked: boolean;
  onClick: () => void;
}

/** The form's one primary action: full width on a phone, a spinner and "Reading your idea…" the moment it's tapped. */
export default function SuggestionSendButton({ label, submitting, waitingForCheck, blocked, onClick }: SuggestionSendButtonProps) {
  return (
    <LoadingButton
      type="button"
      className="w-full sm:w-auto"
      isLoading={submitting}
      loadingText={SUGGEST_COPY.submitting}
      disabled={waitingForCheck || blocked}
      onClick={onClick}
    >
      {waitingForCheck ? SUGGEST_COPY.waitingForCheck : label}
    </LoadingButton>
  );
}
