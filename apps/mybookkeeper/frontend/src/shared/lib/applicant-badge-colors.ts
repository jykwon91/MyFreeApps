import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import type { BadgeColor } from "@/shared/components/ui/Badge";

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
