import { Telescope } from "lucide-react";
import { EmptyState, LoadMoreFooter } from "@platform/ui";
import { DISCOVER_EMPTY_STATES } from "@/constants/empty-states";
import ListLoadError from "@/components/ListLoadError";
import { DISCOVERED_JOBS_LIST_MESSAGES as MESSAGES } from "@/constants/discovered-jobs-list-messages";
import DiscoveredJobCard from "@/features/discover/DiscoveredJobCard";
import DiscoveredJobsSkeleton from "@/features/discover/DiscoveredJobsSkeleton";
import { useDiscoveredJobsPages } from "@myjobhunter/api-client/hooks/useDiscoveredJobsPages";
import { discoveredJobsFilter } from "@myjobhunter/api-client/utils/discoveredJobsFilter";
import { useListDiscoverySourcesQuery } from "@myjobhunter/api-client/store/discoverApi";
import { useGetProfileQuery } from "@myjobhunter/api-client/store/profileApi";

interface DiscoverSavedViewProps {
  /** Active source filter from ?source= URL param. Null = no filter (show all). */
  activeSourceId: string | null;
  /** Clears the source filter, so every saved search's saved postings show. */
  onShowAllSources: () => void;
}

/** The Saved tab: postings held for later, a page at a time, filtered like the inbox. */
export default function DiscoverSavedView({ activeSourceId, onShowAllSources }: DiscoverSavedViewProps) {
  const list = useDiscoveredJobsPages(discoveredJobsFilter("saved", activeSourceId), 0);
  const { data: sources } = useListDiscoverySourcesQuery();
  const { data: profile } = useGetProfileQuery();

  if (list.loadError) {
    return <ListLoadError message={MESSAGES.couldntLoad} retryLabel={MESSAGES.retry} onRetry={list.refetch} />;
  }

  if (list.isLoading || list.isFiltering) {
    return <DiscoveredJobsSkeleton />;
  }

  if (list.jobs.length === 0) {
    const filtered = DISCOVER_EMPTY_STATES.saved_empty_filtered;
    return activeSourceId ? (
      <EmptyState
        icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
        heading={filtered.heading}
        body={filtered.body}
        action={{ label: filtered.actionLabel, onClick: onShowAllSources }}
      />
    ) : (
      <EmptyState
        icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
        heading={DISCOVER_EMPTY_STATES.saved_empty.heading}
        body={DISCOVER_EMPTY_STATES.saved_empty.body}
      />
    );
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
        messages={MESSAGES}
      />
    </div>
  );
}
