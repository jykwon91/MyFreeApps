import Badge from "@/shared/components/ui/Badge";
import {
  LISTING_STATUS_BADGE_COLORS,
  LISTING_STATUS_LABELS,
} from "@/shared/lib/listing-labels";
import type { ListingStatus } from "@/shared/types/listing/listing-status";

interface Props {
  status: ListingStatus;
}

export default function ListingStatusBadge({ status }: Props) {
  return <Badge label={LISTING_STATUS_LABELS[status]} color={LISTING_STATUS_BADGE_COLORS[status]} />;
}
