import { Telescope } from "lucide-react";
import { EmptyState, LoadMoreFooter } from "@platform/ui";
import ListLoadError from "@/components/ListLoadError";
import { DISCOVER_LIST_VIEW_COPY } from "@/constants/discover-list-view-copy";
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
  const { messages, empty, emptyFiltered } = DISCOVER_LIST_VIEW_COPY[view];

  if (list.loadError) {
    return <ListLoadError message={messages.couldntLoad} retryLabel={messages.retry} onRetry={list.refetch} />;
  }

  if (list.isLoading || list.isFiltering) {
    return <DiscoveredJobsSkeleton view={view} />;
  }

  if (list.jobs.length === 0) {
    return activeSourceId ? (
      <EmptyState
        icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
        heading={emptyFiltered.heading}
        body={emptyFiltered.body}
        action={{ label: emptyFiltered.actionLabel, onClick: onShowAllSources }}
      />
    ) : (
      <EmptyState
        icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
        heading={empty.heading}
        body={empty.body}
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
        messages={messages}
      />
    </div>
  );
}
