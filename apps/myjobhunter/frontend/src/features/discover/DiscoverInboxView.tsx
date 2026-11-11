import { useState } from "react";
import { Telescope } from "lucide-react";
import { EmptyState, LoadingButton } from "@platform/ui";
import { DISCOVER_EMPTY_STATES } from "@/constants/empty-states";
import DiscoveredJobCard from "@/features/discover/DiscoveredJobCard";
import DiscoveredJobsSkeleton from "@/features/discover/DiscoveredJobsSkeleton";
import ProfileCompletenessBanner from "@/features/discover/ProfileCompletenessBanner";
import { useListDiscoveredJobsQuery, useListDiscoverySourcesQuery } from "@myjobhunter/api-client/store/discoverApi";
import { useGetProfileQuery } from "@myjobhunter/api-client/store/profileApi";
import { useScoringActive } from "@myjobhunter/api-client/hooks/useScoringActive";
import type { ScoringWindow } from "@myjobhunter/api-client/types/discovery/scoring-window";
import { inboxCoverageLine } from "@myjobhunter/api-client/utils/inboxCoverageLine";
import { unscoredCount as countUnscored } from "@myjobhunter/api-client/utils/unscoredCount";
import { useListSkillsQuery } from "@myjobhunter/api-client/store/skillsApi";

// Background scoring polls for a bounded window after a refresh succeeds — see
// useScoringWindow (shared with the phone) for why it never polls forever.

// The inbox is one growing list. "Load more" grows `limit` by PAGE_SIZE from
// offset 0 — the API accumulates pages in a single cache entry (see
// serializeQueryArgs in discoverApi), so each fetch re-reads the WHOLE loaded
// window and the server-side score-sort stays global across all loaded rows.
const PAGE_SIZE = 50;

// Backend caps `limit` at 200 (discover.py `le=200`). At the cap the load-more
// control is replaced by a legible note rather than silently truncating — the
// operator dismisses/saves to surface the rest, and the "Scored N of M" line
// already shows the true total.
const MAX_INBOX_LIMIT = 200;

interface DiscoverInboxViewProps {
  hasSources: boolean;
  /** Active source filter from ?source= URL param. Null = no filter (show all). */
  activeSourceId: string | null;
  /** Opened by a saved search's refresh (the page owns it); polls the inbox while it's open. */
  scoringWindow: ScoringWindow;
}

export default function DiscoverInboxView({
  hasSources,
  activeSourceId,
  scoringWindow,
}: DiscoverInboxViewProps) {
  // How many rows the inbox has loaded. "Load more" grows this; a poll/refetch
  // always re-reads the whole [0, limit) window so scores fill in across the
  // full sorted list, not just the latest page.
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Reset the page size when the source filter changes — synchronously in
  // render (React's "adjust state when a prop changes" pattern) so the query
  // fires once at PAGE_SIZE for the new filter, instead of briefly re-fetching
  // the previous (larger) limit as an effect would.
  const [limitFilterKey, setLimitFilterKey] = useState(activeSourceId);
  if (activeSourceId !== limitFilterKey) {
    setLimitFilterKey(activeSourceId);
    setLimit(PAGE_SIZE);
  }

  // Include source_id in query args so RTK Query keys the cache on it. `limit`
  // is intentionally NOT part of the key (see serializeQueryArgs in discoverApi)
  // so growing it accumulates in place. When source_id changes the cache key
  // changes → fresh fetch, no stale data.
  const queryArgs = activeSourceId
    ? { state: "inbox" as const, limit, source_id: activeSourceId }
    : { state: "inbox" as const, limit };

  // Poll only while the bounded scoring window is open (0 = idle). The
  // inbox's unscored count feeds back into the window.
  const { data: jobsData, isLoading, isError, isFetching } = useListDiscoveredJobsQuery(queryArgs, {
    pollingInterval: scoringWindow.pollingInterval,
  });

  const totalCount = jobsData?.total_count ?? null;
  const scoredCount = jobsData?.scored_count ?? null;
  const isScoringActive = useScoringActive(scoringWindow, countUnscored(scoredCount, totalCount));

  const { data: sources } = useListDiscoverySourcesQuery();
  const { data: profile } = useGetProfileQuery();
  const { data: skillsData } = useListSkillsQuery();

  const hasResume = profile?.resume_file_path != null;
  const hasSkills = (skillsData?.total ?? 0) > 0;

  if (!hasSources) {
    return (
      <EmptyState
        icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
        heading={DISCOVER_EMPTY_STATES.no_saved_searches.heading}
        body={DISCOVER_EMPTY_STATES.no_saved_searches.body}
      />
    );
  }

  // Until the profile and skills load, nothing is known to be missing: showing the banner then would flash it.
  const profileBanner =
    profile && skillsData ? <ProfileCompletenessBanner hasResume={hasResume} hasSkills={hasSkills} /> : null;

  if (isError) {
    return (
      <>
        {profileBanner}
        <p className="text-sm text-destructive">
          Couldn't load the inbox — try refreshing the page.
        </p>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        {profileBanner}
        <DiscoveredJobsSkeleton />
      </>
    );
  }

  const items = jobsData?.items ?? [];

  // has_more is the server's COUNT-backed signal that rows exist beyond the
  // loaded window. atCap is the frontend ceiling (backend caps limit at 200).
  const hasMore = jobsData?.has_more ?? false;
  const atCap = limit >= MAX_INBOX_LIMIT;

  // A "load more" is in flight exactly when we've asked for a bigger window
  // than the data currently reflects. Once a fetch settles, the loaded window
  // fills the requested limit, so this is false — and because a poll/refetch
  // returns the same full window, it never spuriously spins during polling.
  const isLoadingMore = isFetching && items.length < limit;

  const handleLoadMore = () => {
    if (atCap) {
      return;
    }
    setLimit((current) => Math.min(current + PAGE_SIZE, MAX_INBOX_LIMIT));
  };

  if (items.length === 0) {
    return (
      <>
        {profileBanner}
        <EmptyState
          icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
          heading={DISCOVER_EMPTY_STATES.inbox_empty.heading}
          body={DISCOVER_EMPTY_STATES.inbox_empty.body}
        />
      </>
    );
  }

  // Coverage line: the scorer only rates the daily prefilter top-N, so a
  // large unscored tail is expected, not a failure — "Scored N of M" says so.
  const coverageLine = inboxCoverageLine(scoredCount, totalCount);

  // Pass profile.updated_at to each card so the card can detect
  // when its score was computed against an older profile snapshot
  // (profile changed after scored_at → "Re-scoring soon" pill).
  const profileUpdatedAt = profile?.updated_at ?? null;

  return (
    <div className="space-y-3">
      {profileBanner}
      {coverageLine && (
        <p
          className="text-xs text-muted-foreground"
          data-testid="inbox-scoring-coverage"
        >
          {coverageLine}
        </p>
      )}
      {items.map((job) => (
        <DiscoveredJobCard
          key={job.id}
          job={job}
          isScoringInFlight={isScoringActive}
          profileUpdatedAt={profileUpdatedAt}
          sources={sources ?? []}
        />
      ))}
      {hasMore && !atCap && (
        <div className="flex justify-center pt-1">
          <LoadingButton
            type="button"
            variant="secondary"
            isLoading={isLoadingMore}
            loadingText="Loading…"
            onClick={handleLoadMore}
            data-testid="inbox-load-more"
          >
            Load more
          </LoadingButton>
        </div>
      )}
      {hasMore && atCap && (
        <p
          className="pt-1 text-center text-xs text-muted-foreground"
          data-testid="inbox-load-more-cap"
        >
          Showing the first {MAX_INBOX_LIMIT}. Dismiss or save jobs to surface
          the rest.
        </p>
      )}
    </div>
  );
}
