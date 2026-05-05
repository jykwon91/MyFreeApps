import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck, ShieldAlert } from "lucide-react";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useGetInquirySpamAssessmentsQuery,
  useMarkInquiryNotSpamMutation,
  useMarkInquirySpamMutation,
} from "@/shared/store/inquiriesApi";
import type { InquirySpamStatus } from "@/shared/types/inquiry/inquiry-spam-status";
import InquirySpamBadge from "./InquirySpamBadge";
import InquiryAuditTrailBody from "./InquiryAuditTrailBody";
import { useInquiryAuditTrailMode } from "./useInquiryAuditTrailMode";

export interface InquirySpamTriagePanelProps {
  inquiryId: string;
  spamStatus: InquirySpamStatus;
  spamScore: number | null;
}

export default function InquirySpamTriagePanel({ inquiryId, spamStatus, spamScore }: InquirySpamTriagePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: assessments = [], isLoading } = useGetInquirySpamAssessmentsQuery(
    inquiryId,
    { skip: !expanded },
  );
  const [markNotSpam, { isLoading: isMarkingNotSpam }] =
    useMarkInquiryNotSpamMutation();
  const [markSpam, { isLoading: isMarkingSpam }] = useMarkInquirySpamMutation();

  const auditTrailMode = useInquiryAuditTrailMode({ expanded, isLoading, assessments });

  async function handleMarkNotSpam() {
    try {
      await markNotSpam(inquiryId).unwrap();
      showSuccess("Marked as not spam.");
    } catch (err) {
      showError("Couldn't update — please try again.");
      console.error(err);
    }
  }

  async function handleMarkSpam() {
    try {
      await markSpam(inquiryId).unwrap();
      showSuccess("Marked as spam.");
    } catch (err) {
      showError("Couldn't update — please try again.");
      console.error(err);
    }
  }

  return (
    <section
      className="border rounded-lg p-4 bg-card space-y-3"
      data-testid="inquiry-spam-triage-panel"
    >
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Spam triage</h2>
          <InquirySpamBadge status={spamStatus} score={spamScore} />
        </div>
        <div className="flex flex-wrap gap-2">
          {spamStatus !== "manually_cleared" && spamStatus !== "clean" ? (
            <LoadingButton
              variant="secondary"
              size="sm"
              isLoading={isMarkingNotSpam}
              loadingText="Saving..."
              onClick={handleMarkNotSpam}
              data-testid="mark-not-spam-button"
            >
              <ShieldCheck className="h-4 w-4 mr-1" aria-hidden="true" />
              Mark as not spam
            </LoadingButton>
          ) : null}
          {spamStatus !== "spam" ? (
            <LoadingButton
              variant="secondary"
              size="sm"
              isLoading={isMarkingSpam}
              loadingText="Saving..."
              onClick={handleMarkSpam}
              data-testid="mark-spam-button"
            >
              <ShieldAlert className="h-4 w-4 mr-1" aria-hidden="true" />
              Mark as spam
            </LoadingButton>
          ) : null}
        </div>
      </header>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        data-testid="spam-triage-toggle"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
        )}
        {expanded ? "Hide" : "Show"} audit trail
      </button>

      <InquiryAuditTrailBody mode={auditTrailMode} assessments={assessments} />
    </section>
  );
}
