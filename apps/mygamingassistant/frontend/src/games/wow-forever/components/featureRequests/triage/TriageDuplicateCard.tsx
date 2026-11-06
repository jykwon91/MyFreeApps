import { useState } from "react";
import clsx from "clsx";
import { LoadingButton } from "@platform/ui";
import TriageCardMeta from "@/games/wow-forever/components/featureRequests/triage/TriageCardMeta";
import TriageSubmissionQuote from "@/games/wow-forever/components/featureRequests/triage/TriageSubmissionQuote";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_STATUS_LABEL, TRIAGE_STATUS_STYLE } from "@/games/wow-forever/data/featureRequests/triage/triageLabels";
import { TRIAGE_CHIP, TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { playersAskedLabel } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageDuplicateCardProps {
  item: TriageInboxItem;
  story: TriageStory;
  onGotIt: () => Promise<unknown>;
  onAddNote: () => void;
}

/** "Already asked": the public story it counted toward (with the new count), the nuance, Got it / Add note. */
export default function TriageDuplicateCard({ item, story, onGotIt, onAddNote }: TriageDuplicateCardProps) {
  const [busy, setBusy] = useState(false);
  return (
    <article data-section="duplicate-card" className="space-y-3 rounded-xl border bg-card p-4">
      <TriageCardMeta item={item} />
      <TriageSubmissionQuote label={TRIAGE_COPY.playerWrote} text={item.untrusted_submission_text} />
      <div className="space-y-1 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={clsx(TRIAGE_CHIP, TRIAGE_STATUS_STYLE[story.status])}>{TRIAGE_STATUS_LABEL[story.status]}</span>
          <span className="text-xs text-muted-foreground">{playersAskedLabel(story.vote_count)}</span>
        </div>
        <p className="font-medium [overflow-wrap:anywhere]">
          <bdi>{story.title}</bdi>
        </p>
      </div>
      {item.nuance_note !== null ? (
        <p className="text-sm [overflow-wrap:anywhere]">
          <span className="font-medium">{TRIAGE_COPY.theyAlsoNoted}</span> <bdi>{item.nuance_note}</bdi>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <LoadingButton
          isLoading={busy}
          loadingText={TRIAGE_COPY.saving}
          onClick={() => {
            setBusy(true);
            void onGotIt().finally(() => setBusy(false));
          }}
        >
          {TRIAGE_COPY.gotIt}
        </LoadingButton>
        <button type="button" onClick={onAddNote} className={TRIAGE_SECONDARY_BUTTON}>
          {TRIAGE_COPY.addNote}
        </button>
      </div>
    </article>
  );
}
