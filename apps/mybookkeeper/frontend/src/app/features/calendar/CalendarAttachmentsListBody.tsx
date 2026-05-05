import type { ListingBlackoutAttachment } from "@/shared/types/listing/listing-blackout-attachment";
import type { CalendarAttachmentsMode } from "@/shared/types/calendar/calendar-attachments-mode";
import CalendarEventAttachmentCard from "@/app/features/calendar/CalendarEventAttachmentCard";
import CalendarEventAttachmentsSkeleton from "@/app/features/calendar/CalendarEventAttachmentsSkeleton";

export interface CalendarAttachmentsListBodyProps {
  mode: CalendarAttachmentsMode;
  attachments: readonly ListingBlackoutAttachment[] | undefined;
  onDelete: (attachment: ListingBlackoutAttachment) => void;
}

export default function CalendarAttachmentsListBody({
  mode,
  attachments,
  onDelete,
}: CalendarAttachmentsListBodyProps) {
  switch (mode) {
    case "loading":
      return <CalendarEventAttachmentsSkeleton />;
    case "list":
      return (
        <ul className="space-y-2" data-testid="attachment-list">
          {attachments!.map((att) => (
            <CalendarEventAttachmentCard
              key={att.id}
              attachment={att}
              onDelete={() => onDelete(att)}
            />
          ))}
        </ul>
      );
    case "empty":
      return (
        <p className="text-xs text-muted-foreground" data-testid="attachments-empty">
          No attachments yet.
        </p>
      );
  }
}
