import { reviewQueueChannelLabel } from "@mybookkeeper/api-client/constants/reviewQueueChannels";
import type { ReviewQueueItem } from "@mybookkeeper/api-client/types/calendar/review-queue-item";
import { REVIEW_MESSAGES } from "../../constants/calendarReview";
import { fullDateLabel } from "../../lib/localDate";

export function reviewItemSubject(item: ReviewQueueItem): string {
  return item.parsed_payload.raw_subject || REVIEW_MESSAGES.noSubject;
}

export function reviewItemChannel(item: ReviewQueueItem): string {
  return reviewQueueChannelLabel(item.source_channel);
}

/** Either date can be missing from the email. */
export function reviewItemDates(item: ReviewQueueItem): string | null {
  const { check_in, check_out } = item.parsed_payload;
  if (!check_in && !check_out) return null;
  return `${check_in ? fullDateLabel(check_in) : "—"} – ${check_out ? fullDateLabel(check_out) : "—"}`;
}

/** Guest, dates and price, whichever the email carried. */
export function reviewItemDetails(item: ReviewQueueItem): string[] {
  const { guest_name, total_price } = item.parsed_payload;
  return [guest_name, reviewItemDates(item), total_price].filter((detail): detail is string => Boolean(detail));
}

/** The channel's own listing id, or the email's id when the channel gave none. */
export function reviewItemListingKey(item: ReviewQueueItem): string {
  return item.parsed_payload.source_listing_id ?? item.email_message_id;
}

export function reviewQueueSpokenLabel(item: ReviewQueueItem): string {
  return [reviewItemChannel(item), reviewItemSubject(item), ...reviewItemDetails(item)].join(", ");
}
