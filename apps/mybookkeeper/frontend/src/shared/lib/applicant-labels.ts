import type { BadgeColor } from "@/shared/components/ui/Badge";
import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";

/**
 * Stage label & color tables for the Applicants domain.
 *
 * Mirrors backend tuples in ``app/core/applicant_enums.py`` — keep both in
 * sync when stages are added (canonical source of truth is the backend
 * ``CheckConstraint`` per RENTALS_PLAN.md §4.1).
 */

export const APPLICANT_STAGES: readonly ApplicantStage[] = [
  "lead",
  "screening_pending",
  "screening_passed",
  "screening_failed",
  "video_call_done",
  "approved",
  "lease_sent",
  "lease_signed",
  "declined",
] as const;

export const APPLICANT_STAGE_LABELS: Record<ApplicantStage, string> = {
  lead: "Lead",
  screening_pending: "Screening Pending",
  screening_passed: "Screening Passed",
  screening_failed: "Screening Failed",
  video_call_done: "Video Call Done",
  approved: "Approved",
  lease_sent: "Lease Sent",
  lease_signed: "Lease Signed",
  declined: "Declined",
};

/**
 * Stage badge colors per RENTALS_PLAN.md §9.1: gray for early (lead),
 * yellow for in-flight screening / pending decisions, blue for in-progress
 * (video call done / lease sent), green for positive outcomes (passed /
 * approved / signed), red for negative (failed / declined).
 */
export const APPLICANT_STAGE_BADGE_COLORS: Record<ApplicantStage, BadgeColor> = {
  lead: "gray",
  screening_pending: "yellow",
  screening_passed: "green",
  screening_failed: "red",
  video_call_done: "blue",
  approved: "green",
  lease_sent: "blue",
  lease_signed: "green",
  declined: "red",
};

export const APPLICANT_PAGE_SIZE = 25;
