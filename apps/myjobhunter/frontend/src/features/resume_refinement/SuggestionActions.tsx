import { Pencil, RefreshCw, SkipForward } from "lucide-react";
import { LoadingButton } from "@platform/ui";

interface SuggestionActionsProps {
  onAccept: () => void;
  onSwitchToCustom: () => void;
  onSwitchToAlternative: () => void;
  onSkip: () => void;
  isPending: boolean;
  acceptIsLoading: boolean;
  hasProposal: boolean;
}

// Action row shown when the user is in VIEW mode: accept the AI's
// proposal, write their own, ask for another option, or skip.
// Extracted to keep PendingProposalCard focused on orchestration.
export default function SuggestionActions({
  onAccept,
  onSwitchToCustom,
  onSwitchToAlternative,
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
      <button
        type="button"
        onClick={onSwitchToCustom}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        <Pencil size={14} /> Write my own
      </button>
      <button
        type="button"
        onClick={onSwitchToAlternative}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        <RefreshCw size={14} /> Another option
      </button>
      <button
        type="button"
        onClick={onSkip}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 ml-auto"
      >
        <SkipForward size={14} /> Skip
      </button>
    </div>
  );
}
