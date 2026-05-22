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
import EventListItem from "./EventListItem";
import { useListApplicationEventsQuery } from "@/lib/applicationsApi";
import type { ApplicationEvent } from "@/types/application-event";

interface EventsSectionProps {
  applicationId: string;
}

export default function EventsSection({ applicationId }: EventsSectionProps) {
  const { data: eventsData } = useListApplicationEventsQuery(applicationId);
  const events = eventsData?.items ?? [];
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

  return (
    <section>
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">
          Activity{" "}
          <span className="text-muted-foreground font-normal">({events.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => setCreateDialogOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md hover:bg-muted"
        >
          <Plus size={12} />
          Log event
        </button>
      </header>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground border rounded-lg p-3 bg-muted/30">
          No events yet.
        </p>
      ) : (
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
      )}

      <LogEventDialog
        applicationId={applicationId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </section>
  );
}
