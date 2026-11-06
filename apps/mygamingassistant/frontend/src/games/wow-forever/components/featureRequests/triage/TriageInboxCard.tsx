import { useId, useState, type Ref } from "react";
import TriageActionBar from "@/games/wow-forever/components/featureRequests/triage/TriageActionBar";
import TriageAreaSelect from "@/games/wow-forever/components/featureRequests/triage/TriageAreaSelect";
import TriageCardMeta from "@/games/wow-forever/components/featureRequests/triage/TriageCardMeta";
import TriagePriorityPicker from "@/games/wow-forever/components/featureRequests/triage/TriagePriorityPicker";
import TriageStoryPreview from "@/games/wow-forever/components/featureRequests/triage/TriageStoryPreview";
import TriageSubmissionQuote from "@/games/wow-forever/components/featureRequests/triage/TriageSubmissionQuote";
import TriageUndoBar from "@/games/wow-forever/components/featureRequests/triage/TriageUndoBar";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import type { InboxCardEdits } from "@/games/wow-forever/types/featureRequests/triage/inboxCardEdits";
import type { PendingDelayedAction } from "@/games/wow-forever/types/featureRequests/triage/pendingDelayedAction";
import type { TriageErrorView } from "@/games/wow-forever/types/featureRequests/triage/triageErrorView";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageInboxCardProps {
  item: TriageInboxItem;
  story: TriageStory;
  pending: PendingDelayedAction | undefined;
  error: TriageErrorView | undefined;
  approveRef: Ref<HTMLButtonElement>;
  onApprove: (edits: InboxCardEdits) => void;
  onUndo: () => void;
  onEdit: () => void;
  onMerge: () => void;
  onNotPlanned: () => void;
  onHide: () => void;
}

/**
 * A new idea waiting for review: what the player wrote (untrusted), how Claude read it, the private
 * priority / area row, and the actions. After Approve / Not planned / Hide it collapses in place to the
 * undo bar — it stays mounted, so a failed save re-expands it with the edits intact.
 */
export default function TriageInboxCard(props: TriageInboxCardProps) {
  const { item, story, pending, error } = props;
  const [edits, setEdits] = useState<InboxCardEdits>({ priority: story.priority, area: story.area });
  const areaId = useId();

  if (pending !== undefined) {
    return (
      <article data-section="inbox-card" data-submission-id={item.submission_id} className="rounded-xl border bg-card p-4">
        <TriageUndoBar pending={pending} onUndo={props.onUndo} />
      </article>
    );
  }

  return (
    <article
      data-section="inbox-card"
      data-submission-id={item.submission_id}
      className="space-y-4 rounded-xl border bg-card p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <TriageCardMeta item={item} />
          <div className="space-y-2" data-row="quote">
            <TriageSubmissionQuote label={TRIAGE_COPY.playerWrote} text={item.untrusted_submission_text} />
            {item.untrusted_clarification_answer !== null ? (
              <TriageSubmissionQuote label={TRIAGE_COPY.theyAnswered} text={item.untrusted_clarification_answer} />
            ) : null}
          </div>
        </div>
        <div className="space-y-3">
          <div data-row="story">
            <TriageStoryPreview story={story} />
          </div>
          <div className="flex flex-wrap items-end gap-3" data-row="private">
            <div className="space-y-1">
              <span className="block text-sm font-medium">{TRIAGE_COPY.priority}</span>
              <TriagePriorityPicker value={edits.priority} onChange={(priority) => setEdits((e) => ({ ...e, priority }))} />
            </div>
            <div className="min-w-0 flex-1 basis-40">
              <TriageAreaSelect id={areaId} value={edits.area} onChange={(area) => setEdits((e) => ({ ...e, area }))} />
            </div>
          </div>
        </div>
      </div>
      {error !== undefined ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error.message}
        </p>
      ) : null}
      <TriageActionBar
        approveRef={props.approveRef}
        onApprove={() => props.onApprove(edits)}
        onEdit={props.onEdit}
        onMerge={props.onMerge}
        onNotPlanned={props.onNotPlanned}
        onHide={props.onHide}
      />
    </article>
  );
}
