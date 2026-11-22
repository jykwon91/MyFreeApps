/**
 * Events section of the ApplicationDrawer.
 *
 * Renders the chronological event log newest-first. The "Log event"
 * affordance opens LogEventDialog in create mode. Interview events show
 * an inline pencil button that swaps the read-only summary in
 * EventListItem for an edit-in-place form. Only one event can be in
 * edit mode at a time; clicking pencil on a different event silently
 * cancels whatever was open.
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import LogEventDialog from "@/features/applications/LogEventDialog";
import ListLoadError from "@/components/ListLoadError";
import EventListItem from "./EventListItem";
import EventsSkeleton from "./EventsSkeleton";
import { APPLICATION_EVENTS_LOAD_MESSAGES as MESSAGES } from "@myjobhunter/api-client/constants/applicationEventsLoadMessages";
import { useListApplicationEventsQuery } from "@myjobhunter/api-client/store/applicationsApi";
import type { ApplicationEvent } from "@myjobhunter/api-client/types/application-event";

interface EventsSectionProps {
  applicationId: string;
}

export default function EventsSection({ applicationId }: EventsSectionProps) {
  const { currentData, isFetching, isError, refetch } = useListApplicationEventsQuery(applicationId);
  const events = currentData?.items;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  function handleEditClick(event: ApplicationEvent) {
    setEditingEventId(event.id);
  }

  function handleCancelEdit() {
    setEditingEventId(null);
  }

  function handleSaved() {
    setEditingEventId(null);
  }

  function body() {
    if (!events) {
      if (isFetching) return <EventsSkeleton />;
      if (isError) {
        return <ListLoadError message={MESSAGES.couldntLoad} retryLabel={MESSAGES.tryAgain} onRetry={refetch} />;
      }
      return null;
    }
    if (events.length === 0) {
      return (
        <p className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30">
          {MESSAGES.none}
        </p>
      );
    }
    return (
      <ol className="space-y-2">
        {events.map((event) => (
          <EventListItem
            key={event.id}
            applicationId={applicationId}
            event={event}
            isEditing={editingEventId === event.id}
            onEditClick={handleEditClick}
            onCancelEdit={handleCancelEdit}
            onSaved={handleSaved}
          />
        ))}
      </ol>
    );
  }

  return (
    <section>
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">
          Activity
          {events ? (
            <>
              {" "}
              <span className="text-muted-foreground font-normal">({events.length})</span>
            </>
          ) : null}
        </h2>
        <button
          type="button"
          onClick={() => setCreateDialogOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border border-input rounded-md hover:bg-muted"
        >
          <Plus size={12} />
          Log event
        </button>
      </header>
      {body()}

      <LogEventDialog
        applicationId={applicationId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </section>
  );
}
