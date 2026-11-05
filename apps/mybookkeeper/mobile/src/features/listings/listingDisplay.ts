import { LISTING_STATUS_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import type { ListingResponse } from "@mybookkeeper/api-client/types/listing/listing-response";
import type { ListingStatus } from "@mybookkeeper/api-client/types/listing/listing-status";
import type { ListingSummary } from "@mybookkeeper/api-client/types/listing/listing-summary";
import { formatRate } from "@mybookkeeper/api-client/utils/formatRate";
import { WEB_BASE_URL } from "../../constants/api";
import { LISTING_MESSAGES } from "../../constants/listings";

export function inquiryFormLink(slug: string): string {
  return `${WEB_BASE_URL}/apply/${slug}`;
}

function days(count: number): string {
  return count === 1 ? "1 day" : `${count} days`;
}

export function yesOrNo(value: boolean): string {
  return value ? LISTING_MESSAGES.yes : LISTING_MESSAGES.no;
}

export function statusFilterLabel(status: ListingStatus | null): string {
  return `Status: ${status ? LISTING_STATUS_LABELS[status] : LISTING_MESSAGES.allStatuses}`;
}

export function monthlyRateText(rate: string): string {
  return `${formatRate(rate)} a month`;
}

/** Null when there are no limits to show. */
export function stayLimits(listing: Pick<ListingResponse, "min_stay_days" | "max_stay_days">): string | null {
  const limits = [
    listing.min_stay_days ? `At least ${days(listing.min_stay_days)}` : null,
    listing.max_stay_days ? `at most ${days(listing.max_stay_days)}` : null,
  ].filter(Boolean);
  if (limits.length === 0) return null;
  const text = limits.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function listingRowLabel(listing: ListingSummary, propertyName: string | null): string {
  return [listing.title, propertyName, LISTING_STATUS_LABELS[listing.status], monthlyRateText(listing.monthly_rate)].filter(Boolean).join(", ");
}

export function noListingsWithStatus(status: ListingStatus): string {
  return `No listings are ${LISTING_STATUS_LABELS[status].toLowerCase()} right now.`;
}
