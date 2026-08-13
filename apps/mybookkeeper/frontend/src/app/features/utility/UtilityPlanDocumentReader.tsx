import DocumentReaderCard from "@/app/features/documents/DocumentReaderCard";
import {
  useExtractUtilityPlanFromUploadMutation,
  useExtractUtilityPlanMutation,
} from "@/shared/store/utilityPlansApi";
import type { DocumentSource } from "@/shared/types/document/document-source";
import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";
import { UTILITY_PLAN_INPUT_CLASS } from "./utility-plan-input-class";

export interface UtilityPlanDocumentReaderProps {
  onRead: (draft: UtilityPlanDraft) => void;
}

/**
 * Fill the utility-plan form from an Electricity Facts Label, contract or bill.
 *
 * Everything about picking, reading and failing is the same as the insurance
 * declarations-page reader, so it lives in ``DocumentReaderCard``. What is
 * genuinely utility-specific is which endpoints get called and what the card
 * says it wants.
 */
export default function UtilityPlanDocumentReader({
  onRead,
}: UtilityPlanDocumentReaderProps) {
  const [extractPlan, { isLoading: isReadingLibrary }] = useExtractUtilityPlanMutation();
  const [extractUpload, { isLoading: isReadingUpload }] =
    useExtractUtilityPlanFromUploadMutation();

  async function read(source: DocumentSource) {
    onRead(
      source.kind === "file"
        ? await extractUpload(source.file).unwrap()
        : await extractPlan({ document_id: source.documentId }).unwrap(),
    );
  }

  return (
    <DocumentReaderCard
      title="Start from a document"
      hint="Add an Electricity Facts Label, a contract, or a bill and I'll fill in what I can."
      read={read}
      isReading={isReadingLibrary || isReadingUpload}
      testIdPrefix="utility-plan"
      inputClass={UTILITY_PLAN_INPUT_CLASS}
    />
  );
}
