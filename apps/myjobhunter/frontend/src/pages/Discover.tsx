import { useState } from "react";
import { Plus, Telescope } from "lucide-react";
import { Button, EmptyState } from "@platform/ui";
import DiscoveredJobCard from "@/features/discover/DiscoveredJobCard";
import NewSavedSearchDialog from "@/features/discover/NewSavedSearchDialog";
import SavedSearchesPanel from "@/features/discover/SavedSearchesPanel";
import {
  useListDiscoveredJobsQuery,
  useListDiscoverySourcesQuery,
} from "@/store/discoverApi";

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
  const { data: jobsData, isLoading } = useListDiscoveredJobsQuery({});

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
          heading="No saved searches yet"
          body={
            "Create a saved search and I'll pull tailored postings from " +
            "Google Jobs (LinkedIn, Indeed, Glassdoor, ZipRecruiter) every " +
            "time you click Refresh."
          }
        />
      )}

      {hasSources && isLoading && (
        <p className="text-sm text-muted-foreground">Loading postings…</p>
      )}

      {hasSources && !isLoading && !hasJobs && (
        <EmptyState
          icon={<Telescope className="w-12 h-12 text-muted-foreground" />}
          heading="Inbox empty"
          body="Click Refresh on a saved search above to fetch the latest postings."
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
