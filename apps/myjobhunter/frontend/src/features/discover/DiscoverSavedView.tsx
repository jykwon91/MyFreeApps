import { Telescope } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { DISCOVER_EMPTY_STATES } from "@/constants/empty-states";
import DiscoveredJobCard from "@/features/discover/DiscoveredJobCard";
import DiscoveredJobsSkeleton from "@/features/discover/DiscoveredJobsSkeleton";
import { useListDiscoveredJobsQuery } from "@/store/discoverApi";

export default function DiscoverSavedView() {
  const { data: jobsData, isLoading, isError } = useListDiscoveredJobsQuery({
    state: "saved",
  });

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Couldn't load saved jobs — try refreshing the page.
      </p>
    );
  }

  if (isLoading) {
    return <DiscoveredJobsSkeleton />;
  }

  const items = jobsData?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
        heading={DISCOVER_EMPTY_STATES.saved_empty.heading}
        body={DISCOVER_EMPTY_STATES.saved_empty.body}
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((job) => (
        <DiscoveredJobCard key={job.id} job={job} />
      ))}
    </div>
  );
}
