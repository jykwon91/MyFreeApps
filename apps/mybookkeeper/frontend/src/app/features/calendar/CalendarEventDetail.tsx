import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { CalendarEvent } from "@/shared/types/calendar/calendar-event";
import CalendarEventDetailBody from "@/app/features/calendar/CalendarEventDetailBody";

export interface CalendarEventDetailProps {
  event: CalendarEvent | null;
  onClose: () => void;
}

/**
 * Detail dialog for a single blackout/booking.
 *
 * Read-only fields (source, dates, channel ID) + editable host fields
 * (notes textarea, file attachments). See CalendarEventDetailBody for
 * the content layout; CalendarEventNotesSection and
 * CalendarEventAttachmentsSection for the editable sections.
 */
export default function CalendarEventDetail({ event, onClose }: CalendarEventDetailProps) {
  const open = event !== null;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content
          data-testid="calendar-event-detail"
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        >
          {event ? <CalendarEventDetailBody event={event} /> : null}
          <Dialog.Close
            className="absolute top-3 right-3 rounded-md p-1 hover:bg-muted transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X size={18} aria-hidden="true" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
