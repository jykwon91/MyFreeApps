import { Pencil, SkipForward } from "lucide-react";
import { Button, LoadingButton } from "@platform/ui";

interface SuggestionActionsProps {
  onAccept: () => void;
  onSwitchToCustom: () => void;
  onSkip: () => void;
  isPending: boolean;
  acceptIsLoading: boolean;
  hasProposal: boolean;
}

// Action row shown when the user is in VIEW mode: accept the AI's
// proposal, write their own, or skip. Asking for a different take
// lives in the always-visible SuggestionComposer below the card.
// Extracted to keep PendingProposalCard focused on orchestration.
export default function SuggestionActions({
  onAccept,
  onSwitchToCustom,
  onSkip,
  isPending,
  acceptIsLoading,
  hasProposal,
}: SuggestionActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <LoadingButton
        onClick={onAccept}
        isLoading={acceptIsLoading}
        disabled={!hasProposal || isPending}
      >
        Accept
      </LoadingButton>
      <Button
        variant="secondary"
        size="sm"
        onClick={onSwitchToCustom}
        disabled={isPending}
      >
        <span className="inline-flex items-center gap-1.5">
          <Pencil size={14} /> Write my own
        </span>
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={onSkip}
        disabled={isPending}
        className="ml-auto"
      >
        <span className="inline-flex items-center gap-1.5">
          <SkipForward size={14} /> Skip
        </span>
      </Button>
    </div>
  );
}
