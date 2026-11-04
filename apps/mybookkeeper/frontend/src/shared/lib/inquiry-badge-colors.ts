import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";

/**
 * Stage badge colors per RENTALS_PLAN.md §9.1: gray for new/triaged (early),
 * blue for in-progress (replied/screening/scheduled), green for positive
 * outcomes (approved/converted), red for declined, gray-muted for archived.
 */
export const INQUIRY_STAGE_BADGE_COLORS: Record<InquiryStage, BadgeColor> = {
  new: "gray",
  triaged: "gray",
  replied: "blue",
  screening_requested: "blue",
  video_call_scheduled: "blue",
  approved: "green",
  declined: "red",
  converted: "green",
  archived: "gray",
};
