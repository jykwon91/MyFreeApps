import { Telescope } from "lucide-react";
import { EmptyState } from "@platform/ui";
import { DISCOVER_EMPTY_STATES } from "@/constants/empty-states";
import DiscoveredJobCard from "@/features/discover/DiscoveredJobCard";
import DiscoveredJobsSkeleton from "@/features/discover/DiscoveredJobsSkeleton";
import { useListDiscoveredJobsQuery } from "@/store/discoverApi";

// Background scoring runs after /refresh as a FastAPI BackgroundTask
// (~30s for 20 postings). Poll while the inbox is visible so score badges
// fill in without the operator refreshing manually.
const INBOX_POLL_INTERVAL_MS = 4000;

interface DiscoverInboxViewProps {
  hasSources: boolean;
}

export default function DiscoverInboxView({ hasSources }: DiscoverInboxViewProps) {
  const { data: jobsData, isLoading, isError } = useListDiscoveredJobsQuery(
    { state: "inbox" },
    { pollingInterval: INBOX_POLL_INTERVAL_MS },
  );

  if (!hasSources) {
    return (
      <EmptyState
        icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
        heading={DISCOVER_EMPTY_STATES.no_saved_searches.heading}
        body={DISCOVER_EMPTY_STATES.no_saved_searches.body}
      />
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Couldn't load the inbox — try refreshing the page.
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
        heading={DISCOVER_EMPTY_STATES.inbox_empty.heading}
        body={DISCOVER_EMPTY_STATES.inbox_empty.body}
      />
    );
  }

  // PR 4b: when ANY card in the inbox is unscored, the inbox polls
  // every 4s (INBOX_POLL_INTERVAL_MS) until scores fill in. Pass that
  // signal to each unscored card so it can render a spinner in the
  // verdict-badge slot instead of an empty space — the operator sees
  // their fresh postings are being rated, not silently ignored.
  // Once every card has a verdict, polling continues but the spinner
  // simply has nothing to attach to.
  const hasUnscored = items.some((job) => job.score === null);

  return (
    <div className="space-y-3">
      {items.map((job) => (
        <DiscoveredJobCard
          key={job.id}
          job={job}
          isScoringInFlight={hasUnscored}
        />
      ))}
    </div>
  );
}
