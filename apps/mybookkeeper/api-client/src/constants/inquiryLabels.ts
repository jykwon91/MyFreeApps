import type { InquirySource } from "../types/inquiry/inquiry-source";
import type { InquiryStage } from "../types/inquiry/inquiry-stage";

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
  "public_form",
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
  public_form: "Public form",
};

export const INQUIRY_SOURCE_SHORT_LABELS: Record<InquirySource, string> = {
  FF: "FF",
  TNH: "TNH",
  direct: "Direct",
  other: "Other",
  public_form: "Form",
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
