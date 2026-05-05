import type { InquirySpamAssessment } from "@/shared/types/inquiry/inquiry-spam-assessment";
import type { InquiryAuditTrailMode } from "@/shared/types/inquiry/inquiry-audit-trail-mode";

interface UseInquiryAuditTrailModeArgs {
  expanded: boolean;
  isLoading: boolean;
  assessments: readonly InquirySpamAssessment[];
}

/**
 * Resolves the audit trail's render mode from the current expanded/loaded
 * state. Single source of truth so the body component is a flat switch
 * instead of a tower of conditionals.
 */
export function useInquiryAuditTrailMode({
  expanded,
  isLoading,
  assessments,
}: UseInquiryAuditTrailModeArgs): InquiryAuditTrailMode {
  if (!expanded) return "collapsed";
  if (isLoading) return "loading";
  if (assessments.length === 0) return "empty";
  return "list";
}
