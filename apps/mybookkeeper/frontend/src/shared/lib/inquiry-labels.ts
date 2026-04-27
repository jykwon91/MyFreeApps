import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { InquirySource } from "@/shared/types/inquiry/inquiry-source";
import type { InquiryStage } from "@/shared/types/inquiry/inquiry-stage";

/**
 * Source / stage label & color tables for the Inquiries domain.
 *
 * Mirrors backend tuples in ``app/core/inquiry_enums.py`` — keep both in
 * sync when stages are added (canonical source of truth is the backend
 * ``CheckConstraint`` per RENTALS_PLAN.md §4.1).
 */

export const INQUIRY_SOURCES: readonly InquirySource[] = [
  "FF",
  "TNH",
  "direct",
  "other",
] as const;

export const INQUIRY_STAGES: readonly InquiryStage[] = [
  "new",
  "triaged",
  "replied",
  "screening_requested",
  "video_call_scheduled",
  "approved",
  "declined",
  "converted",
  "archived",
] as const;

export const INQUIRY_SOURCE_LABELS: Record<InquirySource, string> = {
  FF: "Furnished Finder",
  TNH: "Travel Nurse Housing",
  direct: "Direct",
  other: "Other",
};

export const INQUIRY_SOURCE_SHORT_LABELS: Record<InquirySource, string> = {
  FF: "FF",
  TNH: "TNH",
  direct: "Direct",
  other: "Other",
};

export const INQUIRY_SOURCE_BADGE_COLORS: Record<InquirySource, BadgeColor> = {
  FF: "blue",
  TNH: "purple",
  direct: "gray",
  other: "orange",
};

export const INQUIRY_STAGE_LABELS: Record<InquiryStage, string> = {
  new: "New",
  triaged: "Triaged",
  replied: "Replied",
  screening_requested: "Screening Requested",
  video_call_scheduled: "Video Call Scheduled",
  approved: "Approved",
  declined: "Declined",
  converted: "Converted",
  archived: "Archived",
};

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

export const INQUIRY_PAGE_SIZE = 25;
