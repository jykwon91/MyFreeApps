import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ReviewQueueItem as ReviewQueueItemType } from "@/shared/types/calendar/review-queue-item";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { useGetListingsQuery } from "@/shared/store/listingsApi";
import {
  useResolveQueueItemMutation,
  useIgnoreQueueItemMutation,
  useDismissQueueItemMutation,
} from "@/shared/store/calendarApi";
import ReviewQueueChannelBadge from "@/app/features/calendar/ReviewQueueChannelBadge";
import { useToast } from "@/shared/hooks/useToast";

interface Props {
  item: ReviewQueueItemType;
}

const CHANNEL_LABELS: Record<string, string> = {
  airbnb: "Airbnb",
  furnished_finder: "Furnished Finder",
  booking_com: "Booking.com",
  vrbo: "Vrbo",
};

function formatDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  try {
    return new Date(isoDate + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

/**
 * Single row in the review queue drawer.
 *
 * States:
 *   collapsed  — shows channel badge, subject, date range, price, action buttons.
 *   expanded   — adds an inline listing picker (existing dropdown + resolve CTA).
 *
 * The "Add to MBK" button expands the listing picker. "Ignore" adds the
 * listing to the blocklist and dismisses the item from the queue.
 */
export default function ReviewQueueItem({ item }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { data: listingsEnvelope } = useGetListingsQuery(
    { limit: 100, offset: 0 },
    { skip: !isExpanded },
  );
  const listings = listingsEnvelope?.items ?? [];

  const [resolveItem, { isLoading: isResolving }] = useResolveQueueItemMutation();
  const [ignoreItem, { isLoading: isIgnoring }] = useIgnoreQueueItemMutation();
  const [dismissItem, { isLoading: isDismissing }] = useDismissQueueItemMutation();
  const { showSuccess, showError } = useToast();

  const payload = item.parsed_payload;
  const channelLabel = CHANNEL_LABELS[item.source_channel] ?? item.source_channel;
  const hasDateRange = payload.check_in || payload.check_out;

  async function handleResolve() {
    if (!selectedListingId) {
      setError("Please select a listing first.");
      return;
    }
    setError(null);
    try {
      const result = await resolveItem({
        itemId: item.id,
        body: { listing_id: selectedListingId },
      }).unwrap();
      const { starts_on, ends_on } = result.blackout;
      showSuccess(
        `Booking added — see ${formatDate(starts_on)} → ${formatDate(ends_on)} on the calendar.`,
      );
    } catch {
      showError("I couldn't add this booking. Try again?");
      setError("I couldn't add this booking. Try again?");
    }
  }

  async function handleIgnore() {
    setError(null);
    const sourceListingId = payload.source_listing_id ?? item.email_message_id;
    try {
      await ignoreItem({
        itemId: item.id,
        body: { source_listing_id: sourceListingId },
      }).unwrap();
    } catch {
      setError("I couldn't ignore this booking. Try again?");
    }
  }

  async function handleDismiss() {
    setError(null);
    try {
      await dismissItem(item.id).unwrap();
    } catch {
      setError("I couldn't dismiss this item. Try again?");
    }
  }

  const isAnyLoading = isResolving || isIgnoring || isDismissing;

  return (
    <article
      className="rounded-lg border bg-card p-4 space-y-3"
      data-testid="review-queue-item"
      data-item-id={item.id}
    >
      {/* Row 1: channel badge + subject */}
      <div className="flex items-center gap-3">
        <ReviewQueueChannelBadge channel={item.source_channel} />
        <p
          className="text-sm text-foreground line-clamp-1 flex-1"
          title={payload.raw_subject}
          data-testid="review-queue-subject"
        >
          {payload.raw_subject || "Booking confirmation"}
        </p>
      </div>

      {/* Row 2: guest / date range / price */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {payload.guest_name && (
          <span data-testid="review-queue-guest">{payload.guest_name}</span>
        )}
        {hasDateRange && (
          <span data-testid="review-queue-dates">
            {formatDate(payload.check_in)} – {formatDate(payload.check_out)}
          </span>
        )}
        {payload.total_price && (
          <span
            className="font-medium text-foreground"
            data-testid="review-queue-price"
          >
            {payload.total_price}
          </span>
        )}
      </div>

      {/* Row 3: action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <LoadingButton
          variant="primary"
          size="sm"
          isLoading={isResolving}
          loadingText="Adding..."
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
          aria-controls={`resolve-panel-${item.id}`}
          data-testid="review-queue-add-btn"
          className="min-h-[44px]"
        >
          {isExpanded ? (
            <>
              <ChevronDown className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Add to MBK
            </>
          ) : (
            <>
              <ChevronRight className="h-4 w-4 mr-1.5" aria-hidden="true" />
              Add to MBK
            </>
          )}
        </LoadingButton>

        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={isIgnoring}
          loadingText="Ignoring..."
          onClick={handleIgnore}
          disabled={isAnyLoading}
          data-testid="review-queue-ignore-btn"
          className="min-h-[44px]"
        >
          Ignore forever
        </LoadingButton>

        <button
          type="button"
          onClick={handleDismiss}
          disabled={isAnyLoading}
          aria-label="Dismiss"
          className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground min-h-[44px] px-2"
          data-testid="review-queue-dismiss-btn"
        >
          {isDismissing ? "Dismissing…" : "Dismiss"}
        </button>
      </div>

      {/* Inline listing picker (expanded) */}
      {isExpanded && (
        <div
          id={`resolve-panel-${item.id}`}
          className="border-t pt-3 space-y-3"
          data-testid="review-queue-resolve-panel"
        >
          <p className="text-xs text-muted-foreground">
            Which listing in MBK does this {channelLabel} reservation belong to?
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={selectedListingId}
              onChange={(e) => {
                setSelectedListingId(e.target.value);
                setError(null);
              }}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              aria-label="Select a listing"
              data-testid="review-queue-listing-select"
            >
              <option value="">Select a listing…</option>
              {listings.map((listing) => (
                <option key={listing.id} value={listing.id}>
                  {listing.title}
                </option>
              ))}
            </select>

            <LoadingButton
              variant="primary"
              size="sm"
              isLoading={isResolving}
              loadingText="Adding…"
              onClick={handleResolve}
              disabled={!selectedListingId || isAnyLoading}
              data-testid="review-queue-confirm-btn"
              className="min-h-[44px]"
            >
              Confirm
            </LoadingButton>
          </div>
        </div>
      )}

      {/* Error feedback */}
      {error && (
        <p
          className="text-xs text-destructive"
          role="alert"
          data-testid="review-queue-error"
        >
          {error}
        </p>
      )}
    </article>
  );
}
