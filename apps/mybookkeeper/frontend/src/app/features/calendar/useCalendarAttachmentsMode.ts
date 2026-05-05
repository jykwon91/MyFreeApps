import type { ListingBlackoutAttachment } from "@/shared/types/listing/listing-blackout-attachment";
import type { CalendarAttachmentsMode } from "@/shared/types/calendar/calendar-attachments-mode";

interface UseCalendarAttachmentsModeArgs {
  isLoading: boolean;
  attachments: readonly ListingBlackoutAttachment[] | undefined;
}

/**
 * Resolves the render mode for the CalendarEventAttachmentsSection list area.
 * Single source of truth so the body component is a flat switch.
 */
export function useCalendarAttachmentsMode({
  isLoading,
  attachments,
}: UseCalendarAttachmentsModeArgs): CalendarAttachmentsMode {
  if (isLoading) return "loading";
  if (attachments && attachments.length > 0) return "list";
  return "empty";
}
