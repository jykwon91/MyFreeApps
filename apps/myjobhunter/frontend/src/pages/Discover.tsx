import { useState } from "react";
import { Plus } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@platform/ui";
import DiscoverInboxView from "@/features/discover/DiscoverInboxView";
import DiscoverListView from "@/features/discover/DiscoverListView";
import DiscoverTabPanel from "@/features/discover/DiscoverTabPanel";
import DiscoverViewTabs from "@/features/discover/DiscoverViewTabs";
import NewSavedSearchDialog from "@/features/discover/NewSavedSearchDialog";
import SavedSearchesPanel from "@/features/discover/SavedSearchesPanel";
import SourceFilterChips from "@/features/discover/SourceFilterChips";
import { useScoringWindow } from "@myjobhunter/api-client/hooks/useScoringWindow";
import { useListDiscoverySourcesQuery } from "@myjobhunter/api-client/store/discoverApi";
import type { DiscoverView } from "@myjobhunter/api-client/types/discovery/discover-view";
import { isDiscoverView } from "@myjobhunter/api-client/utils/isDiscoverView";

/**
 * /discover — proactive job-posting inbox.
 *
 * Pulls postings from the configured saved searches (today: JSearch /
 * Google Jobs only) into a triage list. The operator clicks "Save",
 * "Dismiss", or the external "Open" link per posting; the Dismissed tab
 * lists dismissed postings, each with "Restore".
 *
 * Tab state lives in ?view=inbox (default) | ?view=saved | ?view=dismissed
 * so deep-linking and back-button work correctly.
 *
 * Source filter lives in ?source=<uuid> — selecting a chip sets the param,
 * selecting "All" deletes it. Uses replace: true so back-button goes to the
 * previous page rather than cycling through chip selections.
 */
export default function Discover() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const rawView = searchParams.get("view");
  const activeView: DiscoverView = isDiscoverView(rawView) ? rawView : "inbox";

  const activeSourceId = searchParams.get("source");
  // Owned here, above both the saved searches (whose refresh opens it) and the inbox (which it polls).
  const scoringWindow = useScoringWindow(activeSourceId);

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

  function setSourceFilter(sourceId: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (sourceId === null) {
          next.delete("source");
        } else {
          next.set("source", sourceId);
        }
        return next;
      },
      { replace: true },
    );
  }

  const { data: sources } = useListDiscoverySourcesQuery();
  const hasSources = (sources?.length ?? 0) > 0;

  return (
    <div className="p-4 sm:p-8 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Discovery</h1>
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

      <SavedSearchesPanel onRefreshed={scoringWindow.open} />

      {hasSources && (
        <SourceFilterChips
          sources={sources ?? []}
          activeSourceId={activeSourceId}
          onSelect={setSourceFilter}
        />
      )}

      <DiscoverViewTabs activeView={activeView} onSelect={setView} />

      <DiscoverTabPanel activeView={activeView}>
        {activeView === "inbox" ? (
          <DiscoverInboxView
            hasSources={hasSources}
            activeSourceId={activeSourceId}
            scoringWindow={scoringWindow}
          />
        ) : (
          <DiscoverListView
            key={activeView}
            view={activeView}
            activeSourceId={activeSourceId}
            onShowAllSources={() => setSourceFilter(null)}
          />
        )}
      </DiscoverTabPanel>

      <NewSavedSearchDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
