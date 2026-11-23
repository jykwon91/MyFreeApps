import { LoadMoreFooter } from "@platform/ui";
import ListLoadError from "@/components/ListLoadError";
import { DISCOVER_LIST_VIEW_MESSAGES } from "@/constants/discover-list-view-messages";
import DiscoverEmptyState from "@/features/discover/DiscoverEmptyState";
import DiscoveredJobCard from "@/features/discover/DiscoveredJobCard";
import DiscoveredJobsSkeleton from "@/features/discover/DiscoveredJobsSkeleton";
import type { DiscoverListViewKind } from "@/types/discover-list-view-kind";
import { useDiscoveredJobsPages } from "@myjobhunter/api-client/hooks/useDiscoveredJobsPages";
import { discoveredJobsFilter } from "@myjobhunter/api-client/utils/discoveredJobsFilter";
import { useListDiscoverySourcesQuery } from "@myjobhunter/api-client/store/discoverApi";
import { useGetProfileQuery } from "@myjobhunter/api-client/store/profileApi";

interface DiscoverListViewProps {
  /** Saved: postings held for later. Dismissed: postings dismissed, newest first, each with Restore. */
  view: DiscoverListViewKind;
  /** Active source filter from ?source= URL param. Null = no filter (show all). */
  activeSourceId: string | null;
  /** Clears the source filter, so every saved search's postings show. */
  onShowAllSources: () => void;
}

/** The Saved or Dismissed tab: its postings a page at a time, filtered by saved search like the inbox. */
export default function DiscoverListView({ view, activeSourceId, onShowAllSources }: DiscoverListViewProps) {
  const list = useDiscoveredJobsPages(discoveredJobsFilter(view, activeSourceId), 0);
  const { data: sources } = useListDiscoverySourcesQuery();
  const { data: profile } = useGetProfileQuery();
  const messages = DISCOVER_LIST_VIEW_MESSAGES[view];

  if (list.loadError) {
    return <ListLoadError message={messages.couldntLoad} retryLabel={messages.retry} onRetry={list.refetch} />;
  }

  if (list.isLoading || list.isFiltering) {
    return <DiscoveredJobsSkeleton view={view} />;
  }

  if (list.jobs.length === 0) {
    return <DiscoverEmptyState view={view} isFiltered={activeSourceId !== null} onShowAllSources={onShowAllSources} />;
  }

  return (
    <div className="space-y-3">
      {list.jobs.map((job) => (
        <DiscoveredJobCard
          key={job.id}
          job={job}
          profileUpdatedAt={profile?.updated_at ?? null}
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
        messages={messages}
      />
    </div>
  );
}
