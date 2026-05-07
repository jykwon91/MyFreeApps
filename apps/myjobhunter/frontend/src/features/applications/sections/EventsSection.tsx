/**
 * Events section of the ApplicationDrawer.
 *
 * Renders the chronological event log newest-first. The "Log event"
 * affordance opens the existing LogEventDialog for non-transition events
 * (notes, follow-ups via ``follow_up_sent``, ad-hoc).
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@platform/ui";
import LogEventDialog from "@/features/applications/LogEventDialog";
import { useListApplicationEventsQuery } from "@/lib/applicationsApi";
import type { ApplicationEventType } from "@/types/application-event";

const EVENT_LABELS: Record<ApplicationEventType, string> = {
  applied: "Applied",
  email_received: "Email received",
  interview_scheduled: "Interview scheduled",
  interview_completed: "Interview completed",
  rejected: "Rejected",
  offer_received: "Offer received",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
  note_added: "Note",
  follow_up_sent: "Follow-up sent",
};

const EVENT_BADGE_COLOR: Record<
  ApplicationEventType,
  "gray" | "blue" | "yellow" | "green" | "red" | "purple"
> = {
  applied: "blue",
  email_received: "gray",
  interview_scheduled: "yellow",
  interview_completed: "yellow",
  rejected: "red",
  offer_received: "green",
  withdrawn: "gray",
  ghosted: "gray",
  note_added: "purple",
  follow_up_sent: "blue",
};

interface EventsSectionProps {
  applicationId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function EventsSection({ applicationId }: EventsSectionProps) {
  const { data: eventsData } = useListApplicationEventsQuery(applicationId);
  const events = eventsData?.items ?? [];
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <section>
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">
          Activity{" "}
          <span className="text-muted-foreground font-normal">({events.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
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
            <li key={event.id} className="border rounded-lg p-3 bg-muted/20">
              <div className="flex items-center justify-between gap-2">
                <Badge
                  label={EVENT_LABELS[event.event_type]}
                  color={EVENT_BADGE_COLOR[event.event_type]}
                />
                <span className="text-xs text-muted-foreground">
                  {formatDate(event.occurred_at)}
                </span>
              </div>
              {event.note ? (
                <p className="text-sm mt-2 whitespace-pre-wrap">{event.note}</p>
              ) : null}
              {event.source !== "manual" ? (
                <p className="text-xs text-muted-foreground mt-1">via {event.source}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      <LogEventDialog
        applicationId={applicationId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </section>
  );
}
