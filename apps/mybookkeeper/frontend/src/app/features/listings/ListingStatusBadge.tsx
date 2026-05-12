import { StatusBadge } from "@platform/ui";
import type { BadgeTone } from "@platform/ui";
import { LISTING_STATUS_LABELS } from "@/shared/lib/listing-labels";
import type { ListingStatus } from "@/shared/types/listing/listing-status";

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
