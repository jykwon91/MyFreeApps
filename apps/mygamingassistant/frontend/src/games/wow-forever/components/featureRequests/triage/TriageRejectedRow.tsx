import { useState } from "react";
import { LoadingButton } from "@platform/ui";
import TriageCardMeta from "@/games/wow-forever/components/featureRequests/triage/TriageCardMeta";
import TriageSubmissionQuote from "@/games/wow-forever/components/featureRequests/triage/TriageSubmissionQuote";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";

interface TriageRejectedRowProps {
  item: TriageInboxItem;
  onDismiss: () => Promise<unknown>;
}

/** One rejected / unanswered submission: the raw text, Claude's note, and Dismiss. */
export default function TriageRejectedRow({ item, onDismiss }: TriageRejectedRowProps) {
  const [busy, setBusy] = useState(false);
  return (
    <li className="space-y-2 rounded-xl border bg-card p-4" data-section="rejected-row">
      <TriageCardMeta item={item} />
      <TriageSubmissionQuote label={TRIAGE_COPY.playerWrote} text={item.untrusted_submission_text} />
      {item.claude_reason !== null ? (
        <p className="text-sm [overflow-wrap:anywhere]">
          <span className="font-medium">{TRIAGE_COPY.claudeSaid}:</span> <bdi>{item.claude_reason}</bdi>
        </p>
      ) : null}
      <LoadingButton
        variant="secondary"
        isLoading={busy}
        loadingText={TRIAGE_COPY.saving}
        onClick={() => {
          setBusy(true);
          void onDismiss().finally(() => setBusy(false));
        }}
      >
        {TRIAGE_COPY.dismiss}
      </LoadingButton>
    </li>
  );
}
