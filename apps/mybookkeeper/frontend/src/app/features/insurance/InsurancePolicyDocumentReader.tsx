import DocumentReaderCard from "@/app/features/documents/DocumentReaderCard";
import {
  useExtractInsurancePolicyFromUploadMutation,
  useExtractInsurancePolicyMutation,
} from "@/shared/store/insurancePoliciesApi";
import type { DocumentSource } from "@/shared/types/document/document-source";
import type { InsurancePolicyDraft } from "@/shared/types/insurance/insurance-policy-draft";
import { INSURANCE_POLICY_INPUT_CLASS } from "./insurance-policy-input-class";

export interface InsurancePolicyDocumentReaderProps {
  onRead: (draft: InsurancePolicyDraft) => void;
}

/**
 * Fill the policy form from a declarations page.
 *
 * Everything about picking, reading and failing is the same as the utility-plan
 * reader, so it lives in ``DocumentReaderCard``. What is genuinely insurance-
 * specific is which endpoints get called and what the card says it wants.
 *
 * A declarations page is the document worth reading here rather than the full
 * policy: it is the one or two pages carrying every number this form holds, and
 * it is what a carrier emails at renewal — a 40-page policy booklet states the
 * same limits buried in prose, and costs far more to send to the model.
 */
export default function InsurancePolicyDocumentReader({
  onRead,
}: InsurancePolicyDocumentReaderProps) {
  const [extractPolicy, { isLoading: isReadingLibrary }] =
    useExtractInsurancePolicyMutation();
  const [extractUpload, { isLoading: isReadingUpload }] =
    useExtractInsurancePolicyFromUploadMutation();

  async function read(source: DocumentSource) {
    onRead(
      source.kind === "file"
        ? await extractUpload(source.file).unwrap()
        : await extractPolicy({ document_id: source.documentId }).unwrap(),
    );
  }

  return (
    <DocumentReaderCard
      title="Start from a document"
      hint="Add your declarations page, renewal notice, or the policy itself and I'll fill in what I can."
      read={read}
      isReading={isReadingLibrary || isReadingUpload}
      testIdPrefix="insurance-policy"
      inputClass={INSURANCE_POLICY_INPUT_CLASS}
    />
  );
}
