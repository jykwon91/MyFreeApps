import { StatusBadge } from "@platform/ui";
import type { BadgeTone } from "@platform/ui";
import { LISTING_STATUS_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import type { ListingStatus } from "@mybookkeeper/api-client/types/listing/listing-status";

const STATUS_TONES: Record<ListingStatus, BadgeTone> = {
  active: "success",
  paused: "warning",
  draft: "neutral",
  archived: "danger",
};

export interface ListingStatusBadgeProps {
  status: ListingStatus;
}

export default function ListingStatusBadge({ status }: ListingStatusBadgeProps) {
  return <StatusBadge tone={STATUS_TONES[status]} label={LISTING_STATUS_LABELS[status]} />;
}
