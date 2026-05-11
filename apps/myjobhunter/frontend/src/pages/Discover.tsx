import { Plus, Telescope } from "lucide-react";
import { useSearchParams } from "react-router-dom";
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
import { useState } from "react";

// Background scoring runs after /refresh as a FastAPI BackgroundTask
// (~30s for 20 postings). Poll the inbox at 4s while the page is open
// so score badges fill in without the operator refreshing manually.
// Only poll when viewing the inbox — saved view is stable between refreshes.
const INBOX_POLL_INTERVAL_MS = 4000;

type DiscoverView = "inbox" | "saved";

/**
 * /discover — proactive job-posting inbox.
 *
 * Pulls postings from the configured saved searches (today: JSearch /
 * Google Jobs only) into a triage list. The operator clicks "Save",
 * "Dismiss", or the external "Open" link per posting.
 *
 * Tab state lives in ?view=inbox (default) | ?view=saved so deep-linking
 * and back-button work correctly.
 */
export default function Discover() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const rawView = searchParams.get("view");
  const activeView: DiscoverView = rawView === "saved" ? "saved" : "inbox";

  function setView(view: DiscoverView) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (view === "inbox") {
          next.delete("view");
        } else {
          next.set("view", view);
        }
        return next;
      },
      { replace: true },
    );
  }

  const { data: sources } = useListDiscoverySourcesQuery();
  const hasSources = (sources?.length ?? 0) > 0;

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

      <ViewTabs activeView={activeView} onSelect={setView} />

      {activeView === "inbox" ? (
        <InboxView hasSources={hasSources} />
      ) : (
        <SavedView />
      )}

      <NewSavedSearchDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Tab bar
// ---------------------------------------------------------------------------

interface ViewTabsProps {
  activeView: DiscoverView;
  onSelect: (view: DiscoverView) => void;
}

function ViewTabs({ activeView, onSelect }: ViewTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Discover views"
      className="flex gap-1 border-b border-border"
    >
      <TabButton
        label="Inbox"
        view="inbox"
        activeView={activeView}
        onSelect={onSelect}
      />
      <TabButton
        label="Saved"
        view="saved"
        activeView={activeView}
        onSelect={onSelect}
      />
    </div>
  );
}

interface TabButtonProps {
  label: string;
  view: DiscoverView;
  activeView: DiscoverView;
  onSelect: (view: DiscoverView) => void;
}

function TabButton({ label, view, activeView, onSelect }: TabButtonProps) {
  const isActive = view === activeView;
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => onSelect(view)}
      className={[
        "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
        isActive
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inbox view
// ---------------------------------------------------------------------------

interface InboxViewProps {
  hasSources: boolean;
}

function InboxView({ hasSources }: InboxViewProps) {
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

  return (
    <div className="space-y-3">
      {items.map((job) => (
        <DiscoveredJobCard key={job.id} job={job} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Saved view
// ---------------------------------------------------------------------------

function SavedView() {
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
