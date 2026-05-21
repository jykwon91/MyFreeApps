/**
 * Events section of the ApplicationDrawer.
 *
 * Renders the chronological event log newest-first. The "Log event"
 * affordance opens LogEventDialog in create mode. Interview events
 * (interview_scheduled / interview_completed) show an inline pencil
 * button that opens the same dialog in edit mode, preloaded with the
 * existing interview_details + note.
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
  const [editingEvent, setEditingEvent] = useState<ApplicationEvent | null>(null);

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
              event={event}
              onEditClick={setEditingEvent}
            />
          ))}
        </ol>
      )}

      <LogEventDialog
        applicationId={applicationId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        mode="create"
      />
      <LogEventDialog
        applicationId={applicationId}
        open={editingEvent !== null}
        onOpenChange={(open) => {
          if (!open) setEditingEvent(null);
        }}
        mode="edit"
        eventToEdit={editingEvent}
      />
    </section>
  );
}
