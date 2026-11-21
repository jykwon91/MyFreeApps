import { RowPrimaryAction } from "@platform/ui";
import { useNavigate } from "react-router-dom";
import ListingStatusBadge from "./ListingStatusBadge";
import { LISTING_ROOM_TYPE_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import { formatRate } from "@mybookkeeper/api-client/utils/formatRate";
import type { ListingSummary } from "@mybookkeeper/api-client/types/listing/listing-summary";

export interface ListingTableRowProps {
  listing: ListingSummary;
  propertyName: string;
}

/**
 * Desktop table row for a listing. A click anywhere on the row opens the
 * listing; its title is the link keyboard and screen-reader users reach.
 */
export default function ListingTableRow({ listing, propertyName }: ListingTableRowProps) {
  const navigate = useNavigate();
  const detailPath = `/listings/${listing.id}`;

  return (
    <tr
      onClick={() => navigate(detailPath)}
      data-testid={`listing-row-${listing.id}`}
      className="border-t cursor-pointer hover:bg-muted/40"
    >
      <td className="px-4 py-3 font-medium">
        <RowPrimaryAction to={detailPath}>{listing.title}</RowPrimaryAction>
      </td>
      <td className="px-4 py-3 text-muted-foreground">{propertyName}</td>
      <td className="px-4 py-3 text-muted-foreground">{LISTING_ROOM_TYPE_LABELS[listing.room_type]}</td>
      <td className="px-4 py-3"><ListingStatusBadge status={listing.status} /></td>
      <td className="px-4 py-3 text-right font-medium">{formatRate(listing.monthly_rate)}/mo</td>
    </tr>
  );
}
