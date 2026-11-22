import type { ApplicantReference } from "@mybookkeeper/api-client/types/applicant/applicant-reference";
import InquirySection from "../inquiries/InquirySection";
import { referenceLines } from "./applicantDisplay";
import ApplicantHistoryItem from "./ApplicantHistoryItem";

export default function ApplicantReferences({ references }: { references: ApplicantReference[] }) {
  if (references.length === 0) return null;
  return (
    <InquirySection title="References">
      {references.map((reference) => (
        <ApplicantHistoryItem key={reference.id} lines={referenceLines(reference)} title={reference.reference_name} />
      ))}
    </InquirySection>
  );
}
