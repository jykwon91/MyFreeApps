import { Link } from "react-router-dom";
import ListingStatusBadge from "./ListingStatusBadge";
import { LISTING_ROOM_TYPE_LABELS, formatRate } from "@/shared/lib/listing-labels";
import type { ListingSummary } from "@/shared/types/listing/listing-summary";

export interface ListingCardProps {
  listing: ListingSummary;
  propertyName: string;
}

/**
 * Mobile listing card. Whole card is tappable; touch target ≥ 44px tall.
 * Visible data points (per RENTALS_PLAN §9.1 list view):
 *   - title (primary identifier)
 *   - status badge (filter context)
 *   - property name (which property this room belongs to)
 *   - room type (quick scan classifier)
 *   - monthly rate (primary money figure)
 */
export default function ListingCard({ listing, propertyName }: ListingCardProps) {
  return (
    <Link
      to={`/listings/${listing.id}`}
      data-testid={`listing-card-${listing.id}`}
      className="block border rounded-lg p-4 min-h-[44px] hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-medium leading-tight">{listing.title}</p>
        <ListingStatusBadge status={listing.status} />
      </div>
      <p className="text-xs text-muted-foreground truncate">{propertyName}</p>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{LISTING_ROOM_TYPE_LABELS[listing.room_type]}</span>
        <span className="font-medium">{formatRate(listing.monthly_rate)}/mo</span>
      </div>
    </Link>
  );
}
