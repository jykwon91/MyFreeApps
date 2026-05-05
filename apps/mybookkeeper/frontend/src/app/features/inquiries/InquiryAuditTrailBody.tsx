import type { InquirySpamAssessment } from "@/shared/types/inquiry/inquiry-spam-assessment";
import type { InquiryAuditTrailMode } from "@/shared/types/inquiry/inquiry-audit-trail-mode";
import InquiryAuditTrailEmpty from "./InquiryAuditTrailEmpty";
import InquiryAuditTrailList from "./InquiryAuditTrailList";
import InquiryAuditTrailLoading from "./InquiryAuditTrailLoading";

export interface InquiryAuditTrailBodyProps {
  mode: InquiryAuditTrailMode;
  assessments: readonly InquirySpamAssessment[];
}

export default function InquiryAuditTrailBody({
  mode,
  assessments,
}: InquiryAuditTrailBodyProps) {
  switch (mode) {
    case "collapsed":
      return null;
    case "loading":
      return <InquiryAuditTrailLoading />;
    case "empty":
      return <InquiryAuditTrailEmpty />;
    case "list":
      return <InquiryAuditTrailList assessments={assessments} />;
  }
}
