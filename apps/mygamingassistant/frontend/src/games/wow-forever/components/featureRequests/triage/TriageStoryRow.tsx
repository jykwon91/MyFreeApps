import { useId } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import StoryCriteria from "@/games/wow-forever/components/featureRequests/StoryCriteria";
import TriageStoryRowActions from "@/games/wow-forever/components/featureRequests/triage/TriageStoryRowActions";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_STATUS_LABEL, TRIAGE_STATUS_STYLE } from "@/games/wow-forever/data/featureRequests/triage/triageLabels";
import { TRIAGE_CHIP } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { areaChipLabel, playersAskedLabel, storySentence } from "@/games/wow-forever/lib/featureRequests/featureRequestFormat";
import { isValidShippedPath } from "@/games/wow-forever/lib/featureRequests/triage/shippedPathValidator";
import { mergedCountLabel, priorityLabel } from "@/games/wow-forever/lib/featureRequests/triage/triageFormat";
import type { FeatureStoryStatus } from "@/games/wow-forever/types/featureRequests/featureStoryStatus";
import type { PendingDelayedAction } from "@/games/wow-forever/types/featureRequests/triage/pendingDelayedAction";
import type { TriageStatusOption } from "@/games/wow-forever/types/featureRequests/triage/triageStatusOption";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageStoryRowProps {
  story: TriageStory;
  /** The status on screen — an un-sent change shows straight away. */
  status: FeatureStoryStatus;
  mergedCount: number;
  expanded: boolean;
  onToggle: () => void;
  pending: PendingDelayedAction | undefined;
  onUndo: () => void;
  onPickStatus: (option: TriageStatusOption) => void;
  onEdit: () => void;
  onSetHidden: (hidden: boolean) => Promise<unknown>;
}

/**
 * A compact All requests row (title, status, area, priority, count, merged count); tapping it expands the
 * story, criteria and players' notes with Change status / Edit / Hide. Hidden and merged stories are
 * read-only except Unhide.
 */
export default function TriageStoryRow(props: TriageStoryRowProps) {
  const { story, status, expanded } = props;
  const detailsId = useId();
  const nuances = story.submissions.map((s) => s.nuance_note).filter((n): n is string => n !== null);

  return (
    <li data-section="story-row" data-story-id={story.id} className="rounded-xl border bg-card">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={props.onToggle}
        className="block min-h-14 w-full space-y-1.5 p-3 text-left"
      >
        <span data-row="title" className="block font-medium [overflow-wrap:anywhere]">
          <bdi>{story.title}</bdi>
        </span>
        <span data-row="meta" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className={clsx(TRIAGE_CHIP, TRIAGE_STATUS_STYLE[status])}>{TRIAGE_STATUS_LABEL[status]}</span>
          {story.hidden ? <span className={TRIAGE_CHIP}>{TRIAGE_COPY.hiddenChip}</span> : null}
          <span>{areaChipLabel(story.area, null)}</span>
          {story.priority !== null ? <span className="font-medium">{priorityLabel(story.priority)}</span> : null}
          <span>{playersAskedLabel(story.vote_count)}</span>
          {props.mergedCount > 0 ? <span>{mergedCountLabel(props.mergedCount)}</span> : null}
        </span>
      </button>
      {expanded ? (
        <div id={detailsId} className="space-y-3 border-t p-3">
          <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            <bdi>{storySentence(story)}</bdi>
          </p>
          <StoryCriteria criteria={story.acceptance_criteria} followUps={story.follow_ups} />
          {story.operator_note !== null ? (
            <p className="text-sm [overflow-wrap:anywhere]">
              <span className="font-medium">Note to players:</span> <bdi>{story.operator_note}</bdi>
            </p>
          ) : null}
          {story.shipped_path !== null && isValidShippedPath(story.shipped_path) ? (
            <Link to={story.shipped_path} className="inline-flex min-h-11 items-center text-sm text-primary underline">
              {story.shipped_path}
            </Link>
          ) : null}
          {nuances.length > 0 ? (
            <div className="space-y-1">
              <h4 className="text-sm font-medium">Players also noted</h4>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {nuances.map((n, i) => (
                  <li key={i} className="[overflow-wrap:anywhere]">
                    <bdi>{n}</bdi>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <TriageStoryRowActions
            story={story}
            status={status}
            pending={props.pending}
            onUndo={props.onUndo}
            onPickStatus={props.onPickStatus}
            onEdit={props.onEdit}
            onSetHidden={props.onSetHidden}
          />
        </div>
      ) : null}
    </li>
  );
}
