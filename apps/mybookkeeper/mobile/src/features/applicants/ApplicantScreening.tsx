import type { ApplicantDetailResponse } from "@mybookkeeper/api-client/types/applicant/applicant-detail-response";
import { useState } from "react";
import { SCREENING_MESSAGES } from "../../constants/applicantScreening";
import InquiryLine from "../inquiries/InquiryLine";
import InquirySection from "../inquiries/InquirySection";
import { useCanWrite } from "../workspace/useCanWrite";
import { screeningLine, shortDate } from "./applicantDisplay";
import ScreeningActions from "./ScreeningActions";
import ScreeningUploadSheet from "./ScreeningUploadSheet";

export default function ApplicantScreening({ applicant }: { applicant: ApplicantDetailResponse }) {
  const canWrite = useCanWrite();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const results = applicant.screening_results;

  return (
    <InquirySection title="Screening">
      {results.length === 0 ? <InquiryLine left={SCREENING_MESSAGES.nothingYet} muted /> : null}
      {results.map((result) => (
        <InquiryLine key={result.id} left={screeningLine(result)} right={shortDate(result.completed_at ?? result.requested_at)} />
      ))}
      {canWrite ? (
        <>
          <ScreeningActions applicantId={applicant.id} hasResults={results.length > 0} onUpload={() => setIsUploadOpen(true)} />
          <ScreeningUploadSheet applicantId={applicant.id} isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
        </>
      ) : null}
    </InquirySection>
  );
}
