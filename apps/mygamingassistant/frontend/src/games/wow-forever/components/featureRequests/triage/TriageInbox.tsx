import { useCallback, useRef, useState } from "react";
import { AlertBox } from "@platform/ui";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import TriageDuplicateCard from "@/games/wow-forever/components/featureRequests/triage/TriageDuplicateCard";
import TriageEmpty from "@/games/wow-forever/components/featureRequests/triage/TriageEmpty";
import TriageHandledCard from "@/games/wow-forever/components/featureRequests/triage/TriageHandledCard";
import TriageInboxCard from "@/games/wow-forever/components/featureRequests/triage/TriageInboxCard";
import TriageInboxSkeleton from "@/games/wow-forever/components/featureRequests/triage/TriageInboxSkeleton";
import TriageRejectedSection from "@/games/wow-forever/components/featureRequests/triage/TriageRejectedSection";
import { useGetTriageInboxQuery } from "@/games/wow-forever/api/triageApi";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_INBOX_WARN_AT, TRIAGE_PAGE_PATH } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import { INBOX_CARD_KIND, TRIAGE_SHEET_KIND } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";
import { TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { useRefetchOnFocus } from "@/games/wow-forever/hooks/featureRequests/useRefetchOnFocus";
import { useNow } from "@/games/wow-forever/hooks/useNow";
import { inboxCardKind } from "@/games/wow-forever/lib/featureRequests/triage/inboxCardKind";
import { stableInboxOrder } from "@/games/wow-forever/lib/featureRequests/triage/stableInboxOrder";
import {
  actionLeftLabel,
  checkedAgoLabel,
  ideasWaitingLabel,
  newArrivalsLabel,
} from "@/games/wow-forever/lib/featureRequests/triage/triageFormat";
import type { TriageActions } from "@/games/wow-forever/types/featureRequests/triage/triageActions";
import type { TriageInboxItem } from "@/games/wow-forever/types/featureRequests/triage/triageInboxItem";
import type { TriageOpenSheet } from "@/games/wow-forever/types/featureRequests/triage/triageOpenSheet";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageInboxProps {
  actions: TriageActions;
  onOpenSheet: (sheet: TriageOpenSheet) => void;
}

const CLOCK_MS = 30_000;
const submissionId = (item: TriageInboxItem) => item.submission_id;

/**
 * The inbox: "N ideas waiting for you", then one card per untriaged submission, oldest first, in a fixed
 * order (new arrivals wait behind a "N new — Show" pill), then the collapsed rejected section.
 */
export default function TriageInbox({ actions, onOpenSheet }: TriageInboxProps) {
  const query = useGetTriageInboxQuery();
  const { refetch } = query;
  const refetchInbox = useCallback(() => void refetch(), [refetch]);
  useRefetchOnFocus(refetchInbox, query.data !== undefined);
  const now = useNow(CLOCK_MS);
  const [shownIds, setShownIds] = useState<string[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const approveButtons = useRef(new Map<string, HTMLButtonElement>());
  const headlineRef = useRef<HTMLHeadingElement>(null);

  const items = query.data?.items;
  if (items !== undefined && shownIds === null) setShownIds(items.map(submissionId));
  const order = stableInboxOrder(shownIds ?? [], items ?? [], submissionId);
  if (shownIds !== null && order.shown.length === 0 && order.unseen.length > 0) {
    // Nothing on screen to move under the thumb: show arrivals straight away.
    setShownIds([...shownIds, ...order.unseen]);
  }

  if (query.data === undefined) {
    if (query.isError) {
      return <LoadErrorRetry message={TRIAGE_COPY.loadInboxFailed} onRetry={refetchInbox} retrying={query.isFetching} />;
    }
    return <TriageInboxSkeleton />;
  }

  const visible = order.shown.filter((i) => !actions.finished.has(i.submission_id));
  const main = visible.filter((i) => inboxCardKind(i) !== INBOX_CARD_KIND.rejected);
  const rejected = visible.filter((i) => inboxCardKind(i) === INBOX_CARD_KIND.rejected);
  const waiting = main.filter((i) => !actions.pendingById.has(i.submission_id));
  const total = query.data.total_untriaged;

  function focusNextApprove(after: string): void {
    const index = waiting.findIndex((i) => i.submission_id === after);
    const rest = [...waiting.slice(index + 1), ...waiting.slice(0, Math.max(0, index))];
    for (const next of rest) {
      const button = approveButtons.current.get(next.submission_id);
      if (button !== undefined) {
        button.focus();
        return;
      }
    }
    headlineRef.current?.focus();
  }

  function collapsed(item: TriageInboxItem, verb: string): void {
    setAnnouncement(actionLeftLabel(verb, Math.max(0, waiting.length - 1)));
    focusNextApprove(item.submission_id);
  }

  function cardFor(item: TriageInboxItem, story: TriageStory) {
    const kind = inboxCardKind(item);
    const id = item.submission_id;
    if (kind === INBOX_CARD_KIND.alreadyHandled) {
      return <TriageHandledCard key={id} item={item} story={story} onGotIt={() => actions.clearSubmission(item)} />;
    }
    if (kind === INBOX_CARD_KIND.duplicate) {
      return (
        <TriageDuplicateCard
          key={id}
          item={item}
          story={story}
          onGotIt={() => actions.clearSubmission(item)}
          onAddNote={() => onOpenSheet({ kind: TRIAGE_SHEET_KIND.edit, storyId: story.id, fromSubmissionId: id })}
        />
      );
    }
    const sheet = (kind: TriageOpenSheet["kind"]) => onOpenSheet({ kind, storyId: story.id, fromSubmissionId: id });
    return (
      <TriageInboxCard
        key={id}
        item={item}
        story={story}
        pending={actions.pendingById.get(id)}
        error={actions.errors.get(id)}
        approveRef={(el) => {
          if (el === null) approveButtons.current.delete(id);
          else approveButtons.current.set(id, el);
        }}
        onApprove={(edits) => {
          actions.approve(item, story, edits);
          collapsed(item, "Approved");
        }}
        onUndo={() => actions.undo(id)}
        onEdit={() => sheet(TRIAGE_SHEET_KIND.edit)}
        onMerge={() => sheet(TRIAGE_SHEET_KIND.merge)}
        onNotPlanned={() => sheet(TRIAGE_SHEET_KIND.notPlanned)}
        onHide={() => {
          actions.hideFromInbox(item, story);
          collapsed(item, "Hidden");
        }}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="triage-inbox">
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {main.length === 0 && rejected.length === 0 ? (
        <TriageEmpty
          variant="inbox"
          seeAllHref={`${TRIAGE_PAGE_PATH}?tab=all`}
          checkedLabel={checkedAgoLabel(query.fulfilledTimeStamp, now)}
          refreshing={query.isFetching}
          onRefresh={refetchInbox}
        />
      ) : (
        <h2 ref={headlineRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
          {ideasWaitingLabel(total)}
        </h2>
      )}
      {total >= TRIAGE_INBOX_WARN_AT ? <AlertBox variant="warning">{TRIAGE_COPY.inboxAlmostFull}</AlertBox> : null}
      {order.unseen.length > 0 && order.shown.length > 0 ? (
        <button
          type="button"
          onClick={() => setShownIds([...(shownIds ?? []), ...order.unseen])}
          className={TRIAGE_SECONDARY_BUTTON}
        >
          {newArrivalsLabel(order.unseen.length)}
        </button>
      ) : null}
      <div className="space-y-4">
        {main.map((item) => (item.story === null ? null : cardFor(item, item.story)))}
      </div>
      <TriageRejectedSection items={rejected} onDismiss={(item) => actions.clearSubmission(item)} />
    </div>
  );
}
