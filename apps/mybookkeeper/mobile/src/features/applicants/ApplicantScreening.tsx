import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import { useState } from "react";
import { REVEAL_MESSAGES } from "../../constants/applicantReveal";
import { SCREENING_MESSAGES } from "../../constants/applicantScreening";
import InquiryLine from "../inquiries/InquiryLine";
import InquirySection from "../inquiries/InquirySection";
import { useCanWrite } from "../workspace/useCanWrite";
import { screeningLine, screeningUploadedLine, shortDate } from "./applicantDisplay";
import ApplicantHistoryItem from "./ApplicantHistoryItem";
import ScreeningActions from "./ScreeningActions";
import ScreeningUploadSheet from "./ScreeningUploadSheet";

export default function ApplicantScreening({ applicant, isRevealed }: { applicant: ApplicantDetailResponse; isRevealed: boolean }) {
  const canWrite = useCanWrite();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const results = applicant.screening_results;
  const completedResults = results.filter((result) => result.status !== "pending");

  return (
    <InquirySection title="Screening">
      {results.length === 0 ? <InquiryLine left={SCREENING_MESSAGES.nothingYet} muted /> : null}
      {results.map((result) => (
        <ApplicantHistoryItem
          key={result.id}
          lines={[screeningUploadedLine(result), ...(result.has_report && !isRevealed ? [REVEAL_MESSAGES.reportHidden] : [])]}
          right={shortDate(result.completed_at ?? result.requested_at)}
          title={screeningLine(result)}
        />
      ))}
      {canWrite ? (
        <>
          <ScreeningActions applicantId={applicant.id} hasPending={completedResults.length < results.length} hasResults={completedResults.length > 0} onUpload={() => setIsUploadOpen(true)} />
          <ScreeningUploadSheet applicantId={applicant.id} isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
        </>
      ) : null}
    </InquirySection>
  );
}
