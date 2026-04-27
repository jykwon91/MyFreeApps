import { useNavigate } from "react-router-dom";
import ListingStatusBadge from "./ListingStatusBadge";
import { LISTING_ROOM_TYPE_LABELS, formatRate } from "@/shared/lib/listing-labels";
import type { ListingSummary } from "@/shared/types/listing/listing-summary";

interface Props {
  listing: ListingSummary;
  propertyName: string;
}

/**
 * Desktop table row for a listing. The whole row is clickable (programmatic
 * navigation) and exposes a keyboard-accessible button via tabIndex + key
 * handling.
 */
export default function ListingTableRow({ listing, propertyName }: Props) {
  const navigate = useNavigate();
  const goToDetail = () => navigate(`/listings/${listing.id}`);

  return (
    <tr
      role="link"
      tabIndex={0}
      data-testid={`listing-row-${listing.id}`}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDetail();
        }
      }}
      className="border-t cursor-pointer hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <td className="px-4 py-3 font-medium">{listing.title}</td>
      <td className="px-4 py-3 text-muted-foreground">{propertyName}</td>
      <td className="px-4 py-3 text-muted-foreground">{LISTING_ROOM_TYPE_LABELS[listing.room_type]}</td>
      <td className="px-4 py-3"><ListingStatusBadge status={listing.status} /></td>
      <td className="px-4 py-3 text-right font-medium">{formatRate(listing.monthly_rate)}/mo</td>
    </tr>
  );
}
