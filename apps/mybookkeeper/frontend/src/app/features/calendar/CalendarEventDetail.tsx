import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
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

interface Props {
  event: CalendarEvent | null;
  onClose: () => void;
}

/**
 * Read-only detail dialog for a single blackout/booking.
 *
 * Surfaces only the fields MBK actually has. iCal-imported events
 * often have nothing beyond dates + source + opaque event id; rather
 * than show empty fields, we display a friendly note explaining the
 * channel didn't expose more info. The host adds context elsewhere
 * (per-listing notes), so we explicitly do NOT include an editable
 * notes field here — that would be premature data-entry burden.
 */
export default function CalendarEventDetail({ event, onClose }: Props) {
  const open = event !== null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content
          data-testid="calendar-event-detail"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md rounded-lg border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        >
          {event ? <DetailBody event={event} /> : null}
          <Dialog.Close
            className="absolute top-3 right-3 rounded-md p-1 hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DetailBody({ event }: { event: CalendarEvent }) {
  const sourceLabel = getSourceLabel(event.source);
  const sourceColor = getSourceColor(event.source);
  const nights = Math.max(1, daysBetween(event.starts_on, event.ends_on));
  const range = formatWindowLabel(event.starts_on, event.ends_on);
  const synced = relativeTime(event.updated_at);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 pr-8">
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
          and source channel. Edit the booking in {sourceLabel} for more info.
        </p>
      ) : null}
    </div>
  );
}
