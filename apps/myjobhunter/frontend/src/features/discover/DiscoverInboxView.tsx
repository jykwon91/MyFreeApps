import { Telescope } from "lucide-react";
import { EmptyState, LoadMoreFooter } from "@platform/ui";
import ListLoadError from "@/components/ListLoadError";
import { DISCOVER_EMPTY_STATES } from "@/constants/empty-states";
import { DISCOVERED_INBOX_LIST_MESSAGES as MESSAGES } from "@/constants/discovered-inbox-list-messages";
import DiscoveredJobCard from "@/features/discover/DiscoveredJobCard";
import DiscoveredJobsSkeleton from "@/features/discover/DiscoveredJobsSkeleton";
import ProfileCompletenessBanner from "@/features/discover/ProfileCompletenessBanner";
import { useListDiscoverySourcesQuery } from "@myjobhunter/api-client/store/discoverApi";
import { useGetProfileQuery } from "@myjobhunter/api-client/store/profileApi";
import { useDiscoveredJobsPages } from "@myjobhunter/api-client/hooks/useDiscoveredJobsPages";
import { useScoringActive } from "@myjobhunter/api-client/hooks/useScoringActive";
import type { ScoringWindow } from "@myjobhunter/api-client/types/discovery/scoring-window";
import { discoveredJobsFilter } from "@myjobhunter/api-client/utils/discoveredJobsFilter";
import { inboxCoverageLine } from "@myjobhunter/api-client/utils/inboxCoverageLine";
import { unscoredCount as countUnscored } from "@myjobhunter/api-client/utils/unscoredCount";
import { useListSkillsQuery } from "@myjobhunter/api-client/store/skillsApi";

// Background scoring polls for a bounded window after a refresh succeeds — see
// useScoringWindow (shared with the phone) for why it never polls forever.

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
  // Polls only while the bounded scoring window is open (0 = idle). The inbox's
  // unscored count feeds back into the window.
  const list = useDiscoveredJobsPages(discoveredJobsFilter("inbox", activeSourceId), scoringWindow.pollingInterval);
  const isScoringActive = useScoringActive(scoringWindow, countUnscored(list.scoredCount, list.totalCount));

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

  if (list.loadError) {
    return (
      <>
        {profileBanner}
        <ListLoadError message={MESSAGES.couldntLoad} retryLabel={MESSAGES.retry} onRetry={list.refetch} />
      </>
    );
  }

  if (list.isLoading || list.isFiltering) {
    return (
      <>
        {profileBanner}
        <DiscoveredJobsSkeleton />
      </>
    );
  }

  if (list.jobs.length === 0) {
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
  const coverageLine = inboxCoverageLine(list.scoredCount, list.totalCount);

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
      {list.jobs.map((job) => (
        <DiscoveredJobCard
          key={job.id}
          job={job}
          isScoringInFlight={isScoringActive}
          profileUpdatedAt={profileUpdatedAt}
          sources={sources ?? []}
        />
      ))}
      <LoadMoreFooter
        shown={list.jobs.length}
        total={list.total}
        hasNextPage={list.hasNextPage}
        isLoading={list.isFetchingNextPage}
        isError={list.isLoadMoreError}
        onLoadMore={list.loadMore}
        messages={MESSAGES}
      />
    </div>
  );
}
