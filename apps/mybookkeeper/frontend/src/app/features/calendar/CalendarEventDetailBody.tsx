import * as Dialog from "@radix-ui/react-dialog";
import {
  daysBetween,
  formatWindowLabel,
  relativeTime,
} from "@/app/features/calendar/calendar-utils";
import {
  getSourceColor,
  getSourceLabel,
} from "@/shared/lib/calendar-constants";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";
import AttachmentsSection from "@/app/features/calendar/CalendarEventAttachmentsSection";
import NotesSection from "@/app/features/calendar/CalendarEventNotesSection";

interface Props {
  event: CalendarEvent;
}

export default function CalendarEventDetailBody({ event }: Props) {
  const sourceLabel = getSourceLabel(event.source);
  const sourceColor = getSourceColor(event.source);
  const nights = Math.max(1, daysBetween(event.starts_on, event.ends_on));
  const range = formatWindowLabel(event.starts_on, event.ends_on);
  const synced = relativeTime(event.updated_at);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3 pr-10">
        <span
          className="inline-block h-3 w-3 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: sourceColor }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <Dialog.Title className="text-lg font-semibold leading-tight">
            {event.summary ?? `${sourceLabel} booking`}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground">
            {event.listing_name} · {event.property_name}
          </Dialog.Description>
        </div>
      </div>

      {/* Read-only metadata */}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Source</dt>
        <dd className="font-medium">{sourceLabel}</dd>

        <dt className="text-muted-foreground">Dates</dt>
        <dd className="font-medium">{range}</dd>

        <dt className="text-muted-foreground">Nights</dt>
        <dd className="font-medium">{nights}</dd>

        {event.summary ? (
          <>
            <dt className="text-muted-foreground">From channel</dt>
            <dd className="font-medium break-words">{event.summary}</dd>
          </>
        ) : null}

        {event.source_event_id ? (
          <>
            <dt className="text-muted-foreground">Channel ID</dt>
            <dd className="font-mono text-xs break-all">{event.source_event_id}</dd>
          </>
        ) : null}

        <dt className="text-muted-foreground">Last synced</dt>
        <dd className="font-medium">{synced}</dd>
      </dl>

      {!event.summary ? (
        <p className="text-xs text-muted-foreground italic border-t pt-3">
          {sourceLabel} doesn't expose guest details over iCal — only the dates
          and source channel. Paste guest info in the notes below.
        </p>
      ) : null}

      {/* Editable notes — key resets local state when a different blackout is opened */}
      <NotesSection key={event.id} blackoutId={event.id} initialNotes={event.host_notes} />

      {/* Attachments */}
      <AttachmentsSection blackoutId={event.id} />
    </div>
  );
}
