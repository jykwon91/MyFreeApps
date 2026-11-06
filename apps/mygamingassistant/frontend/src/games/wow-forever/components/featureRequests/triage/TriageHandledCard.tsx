import { useState } from "react";
import { LoadingButton } from "@platform/ui";
import TriageCardMeta from "@/games/wow-forever/components/featureRequests/triage/TriageCardMeta";
import TriageSubmissionQuote from "@/games/wow-forever/components/featureRequests/triage/TriageSubmissionQuote";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageHandledCardProps {
  item: TriageInboxItem;
  story: TriageStory;
  onGotIt: () => Promise<unknown>;
}

/** A new idea whose story was already approved or merged elsewhere: only "Got it" is left to do. */
export default function TriageHandledCard({ item, story, onGotIt }: TriageHandledCardProps) {
  const [busy, setBusy] = useState(false);
  const heading = story.status === "duplicate" ? TRIAGE_COPY.alreadyMerged : TRIAGE_COPY.alreadyApproved;
  return (
    <article data-section="handled-card" className="space-y-3 rounded-xl border bg-card p-4">
      <TriageCardMeta item={item} />
      <p className="text-sm font-medium">
        {heading}: <bdi>{story.title}</bdi>
      </p>
      <TriageSubmissionQuote label={TRIAGE_COPY.playerWrote} text={item.untrusted_submission_text} />
      <LoadingButton
        variant="secondary"
        isLoading={busy}
        loadingText={TRIAGE_COPY.saving}
        onClick={() => {
          setBusy(true);
          void onGotIt().finally(() => setBusy(false));
        }}
      >
        {TRIAGE_COPY.gotIt}
      </LoadingButton>
    </article>
  );
}
