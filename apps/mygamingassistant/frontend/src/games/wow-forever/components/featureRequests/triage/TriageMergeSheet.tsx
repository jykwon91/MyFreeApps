import { useCallback, useId, useMemo, useState } from "react";
import { LoadingButton } from "@platform/ui";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import TriageListSkeleton from "@/games/wow-forever/components/featureRequests/triage/TriageListSkeleton";
import TriageMergeCandidates from "@/games/wow-forever/components/featureRequests/triage/TriageMergeCandidates";
import TriageSheetFrame from "@/games/wow-forever/components/featureRequests/triage/TriageSheetFrame";
import { useGetTriageStoriesQuery } from "@/games/wow-forever/api/triageApi";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_INPUT, TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";
import { mergeTargets, rankMergeCandidates, searchMergeTargets } from "@/games/wow-forever/lib/featureRequests/triage/rankMergeCandidates";
import { mergeQuestion } from "@/games/wow-forever/lib/featureRequests/triage/triageFormat";
import type { TriageErrorView } from "@/games/wow-forever/types/featureRequests/triage/triageErrorView";
import type { TriageStory } from "@/games/wow-forever/types/featureRequests/triage/triageStory";

interface TriageMergeSheetProps {
  source: TriageStory;
  onClose: () => void;
  onMerge: (target: TriageStory) => Promise<TriageErrorView | null>;
}

/**
 * Merge into another story: search (title + "I want") or pick from "Maybe the same as…", then confirm —
 * the votes move and it can't be undone. A conflict refreshes the list and asks to pick again.
 */
export default function TriageMergeSheet({ source, onClose, onMerge }: TriageMergeSheetProps) {
  const searchId = useId();
  const query = useGetTriageStoriesQuery();
  const { refetch } = query;
  const retry = useCallback(() => void refetch(), [refetch]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<TriageStory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stories = query.data?.items;
  const suggestions = useMemo(() => (stories === undefined ? [] : rankMergeCandidates(source, stories)), [source, stories]);
  const results = useMemo(
    () =>
      stories === undefined
        ? []
        : searchMergeTargets(mergeTargets(source, stories), search).sort((a, b) => b.vote_count - a.vote_count),
    [source, stories, search],
  );

  async function confirm(target: TriageStory) {
    setBusy(true);
    setError(null);
    const failure = await onMerge(target);
    setBusy(false);
    if (failure === null) {
      onClose();
      return;
    }
    setError(failure.message);
    setPicked(null);
  }

  if (picked !== null) {
    return (
      <TriageSheetFrame
        title={TRIAGE_COPY.mergeTitle}
        onClose={onClose}
        footer={
          <>
            <button type="button" onClick={() => setPicked(null)} disabled={busy} className={TRIAGE_SECONDARY_BUTTON}>
              {TRIAGE_COPY.back}
            </button>
            <LoadingButton variant="destructive" isLoading={busy} loadingText={TRIAGE_COPY.merging} onClick={() => void confirm(picked)}
              className="min-h-11 rounded-md bg-red-600 px-4 text-sm text-white hover:bg-red-700 hover:no-underline">
              {TRIAGE_COPY.mergeConfirm}
            </LoadingButton>
          </>
        }
      >
        <p role="alert" className="text-sm [overflow-wrap:anywhere]" data-testid="triage-merge-confirm">
          <bdi>{mergeQuestion(picked.title, source.vote_count)}</bdi>
        </p>
      </TriageSheetFrame>
    );
  }

  return (
    <TriageSheetFrame title={TRIAGE_COPY.mergeTitle} onClose={onClose}>
      <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
        <bdi>{source.title}</bdi>
      </p>
      {error !== null ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <div className="space-y-1">
        <label htmlFor={searchId} className="text-sm font-medium">
          {TRIAGE_COPY.mergeSearch}
        </label>
        <input
          id={searchId}
          type="search"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={TRIAGE_INPUT}
        />
      </div>
      {stories === undefined ? (
        query.isError ? (
          <LoadErrorRetry message={TRIAGE_COPY.loadStoriesFailed} onRetry={retry} retrying={query.isFetching} />
        ) : (
          <TriageListSkeleton />
        )
      ) : (
        <>
          {search.trim() === "" ? (
            <TriageMergeCandidates heading={TRIAGE_COPY.maybeSame} stories={suggestions.map((c) => c.story)} onPick={setPicked} />
          ) : null}
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">{TRIAGE_COPY.noMatches}</p>
          ) : (
            <TriageMergeCandidates heading={TRIAGE_COPY.allRequests} stories={results} onPick={setPicked} />
          )}
        </>
      )}
    </TriageSheetFrame>
  );
}
