import { useCallback, useMemo, useState } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import TriageEmpty from "@/games/wow-forever/components/featureRequests/triage/TriageEmpty";
import TriageFilters from "@/games/wow-forever/components/featureRequests/triage/TriageFilters";
import TriageListSkeleton from "@/games/wow-forever/components/featureRequests/triage/TriageListSkeleton";
import TriageStoryRow from "@/games/wow-forever/components/featureRequests/triage/TriageStoryRow";
import { useGetTriageStoriesQuery } from "@/games/wow-forever/api/triageApi";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_PAGE_SIZE } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import { TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { useRefetchOnFocus } from "@/games/wow-forever/hooks/featureRequests/useRefetchOnFocus";
import { stableOrder } from "@/games/wow-forever/lib/featureRequests/stableOrder";
import { DEFAULT_TRIAGE_FILTERS } from "@/games/wow-forever/lib/featureRequests/triage/triageParams";
import { filterTriageStories, mergedIntoCounts } from "@/games/wow-forever/lib/featureRequests/triage/triageListView";
import type { TriageActions } from "@/games/wow-forever/types/featureRequests/triage/triageActions";
import type { TriageListFilters } from "@/games/wow-forever/types/featureRequests/triage/triageListFilters";
import type { TriageOpenSheet } from "@/games/wow-forever/types/featureRequests/triage/triageOpenSheet";
import type { TriageStatusOption } from "@/games/wow-forever/types/featureRequests/triage/triageStatusOption";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageAllRequestsProps {
  actions: TriageActions;
  filters: TriageListFilters;
  onFiltersChange: (patch: Partial<TriageListFilters>) => void;
  onOpenSheet: (sheet: TriageOpenSheet) => void;
}

interface ShownOrder {
  key: string;
  ids: string[];
}

/** Every story by status chip, area and sort, 20 at a time; rows keep their place across refetches. */
export default function TriageAllRequests({ actions, filters, onFiltersChange, onOpenSheet }: TriageAllRequestsProps) {
  const query = useGetTriageStoriesQuery();
  const { refetch } = query;
  const refetchStories = useCallback(() => void refetch(), [refetch]);
  useRefetchOnFocus(refetchStories, query.data !== undefined);
  const key = `${filters.status}|${filters.area ?? ""}|${filters.sort}`;
  const [paging, setPaging] = useState({ key, pages: 1 });
  const [order, setOrder] = useState<ShownOrder | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const all = query.data?.items;
  const sorted = useMemo(() => (all === undefined ? [] : filterTriageStories(all, filters)), [all, filters]);
  const mergedCounts = useMemo(() => mergedIntoCounts(all ?? []), [all]);
  const ordered = useMemo(
    () => stableOrder(order !== null && order.key === key ? order.ids : [], sorted),
    [order, key, sorted],
  );
  if (paging.key !== key) setPaging({ key, pages: 1 });
  if (all !== undefined && (order === null || order.key !== key || order.ids.length !== ordered.length)) {
    setOrder({ key, ids: ordered.map((s) => s.id) });
  }

  if (all === undefined) {
    if (query.isError) {
      return <LoadErrorRetry message={TRIAGE_COPY.loadStoriesFailed} onRetry={refetchStories} retrying={query.isFetching} />;
    }
    return <TriageListSkeleton />;
  }

  const shown = ordered.slice(0, paging.pages * TRIAGE_PAGE_SIZE);

  function pickStatus(story: TriageStory, option: TriageStatusOption): void {
    if (option.sheet === "shipped") onOpenSheet({ kind: "shipped", storyId: story.id, fromSubmissionId: null });
    else if (option.sheet === "not_planned") onOpenSheet({ kind: "not_planned", storyId: story.id, fromSubmissionId: null });
    else actions.changeStatus(story, option.status);
  }

  return (
    <div className="space-y-4" data-testid="triage-all">
      <TriageFilters filters={filters} onChange={onFiltersChange} />
      {shown.length === 0 ? (
        <TriageEmpty variant="filtered" onClearFilters={() => onFiltersChange(DEFAULT_TRIAGE_FILTERS)} />
      ) : (
        <ul className="space-y-2">
          {shown.map((story) => {
            const actionId = actions.statusActionId(story.id);
            return (
              <TriageStoryRow
                key={story.id}
                story={story}
                status={actions.optimisticStatus.get(story.id) ?? story.status}
                mergedCount={mergedCounts.get(story.id) ?? 0}
                expanded={expandedId === story.id}
                onToggle={() => setExpandedId((id) => (id === story.id ? null : story.id))}
                pending={actions.pendingById.get(actionId)}
                onUndo={() => actions.undo(actionId)}
                onPickStatus={(option) => pickStatus(story, option)}
                onEdit={() => onOpenSheet({ kind: "edit", storyId: story.id, fromSubmissionId: null })}
                onSetHidden={(hidden) =>
                  actions.saveStory(story, { hidden }, hidden ? TRIAGE_COPY.toastHidden : TRIAGE_COPY.toastUnhidden)
                }
              />
            );
          })}
        </ul>
      )}
      {ordered.length > shown.length ? (
        <button
          type="button"
          onClick={() => setPaging((p) => ({ ...p, pages: p.pages + 1 }))}
          className={TRIAGE_SECONDARY_BUTTON}
        >
          {TRIAGE_COPY.showMore}
        </button>
      ) : null}
    </div>
  );
}
