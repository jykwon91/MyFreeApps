import { useState } from "react";
import { Plus, Telescope } from "lucide-react";
import { Button, EmptyState } from "@platform/ui";
import { DISCOVER_EMPTY_STATES } from "@/constants/empty-states";
import DiscoveredJobCard from "@/features/discover/DiscoveredJobCard";
import DiscoveredJobsSkeleton from "@/features/discover/DiscoveredJobsSkeleton";
import NewSavedSearchDialog from "@/features/discover/NewSavedSearchDialog";
import SavedSearchesPanel from "@/features/discover/SavedSearchesPanel";
import {
  useListDiscoveredJobsQuery,
  useListDiscoverySourcesQuery,
} from "@/store/discoverApi";

// Background scoring runs after /refresh as a FastAPI BackgroundTask
// (~30s for 20 postings). Poll the inbox at 4s while the page is open
// so score badges fill in without the operator refreshing manually.
const INBOX_POLL_INTERVAL_MS = 4000;

/**
 * /discover — proactive job-posting inbox.
 *
 * Pulls postings from the configured saved searches (today: JSearch /
 * Google Jobs only) into a triage list. The operator clicks "Save",
 * "Dismiss", or the external "Open" link per posting.
 *
 * MVP scope (PR 5):
 * - Single inbox view (no master-detail, no keyboard shortcuts)
 * - Saved-search creation via inline dialog (no separate /preferences page)
 * - Manual "Refresh" per saved search (no auto-scheduler yet)
 * - No scoring UI (backend score() endpoint not yet wired in v1)
 * - No promote-to-application yet (operator clicks the external Open
 *   link, applies on the source, manually creates an Application via
 *   /applications when ready)
 */
export default function Discover() {
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: sources } = useListDiscoverySourcesQuery();
  const { data: jobsData, isLoading } = useListDiscoveredJobsQuery(
    {},
    { pollingInterval: INBOX_POLL_INTERVAL_MS },
  );

  const hasSources = (sources?.length ?? 0) > 0;
  const items = jobsData?.items ?? [];
  const hasJobs = items.length > 0;

  return (
    <main className="p-4 sm:p-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Discover</h1>
          <p className="text-sm text-muted-foreground mt-1">
            New postings from LinkedIn, Indeed, Glassdoor, and ZipRecruiter
            via Google Jobs. Refresh a saved search to pull the latest.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="shrink-0">
          <Plus className="w-4 h-4 mr-1" />
          New saved search
        </Button>
      </header>

      <SavedSearchesPanel />

      {!hasSources && (
        <EmptyState
          icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
          heading={DISCOVER_EMPTY_STATES.no_saved_searches.heading}
          body={DISCOVER_EMPTY_STATES.no_saved_searches.body}
        />
      )}

      {hasSources && isLoading && <DiscoveredJobsSkeleton />}

      {hasSources && !isLoading && !hasJobs && (
        <EmptyState
          icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
          heading={DISCOVER_EMPTY_STATES.inbox_empty.heading}
          body={DISCOVER_EMPTY_STATES.inbox_empty.body}
        />
      )}

      {hasJobs && (
        <div className="space-y-3">
          {items.map((job) => (
            <DiscoveredJobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      <NewSavedSearchDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </main>
  );
}
