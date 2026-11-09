import DocumentReaderCard from "@/app/features/documents/DocumentReaderCard";
import {
  useExtractMortgageFromUploadMutation,
  useExtractMortgageMutation,
} from "@mybookkeeper/api-client/store/mortgagesApi";
import type { DocumentSource } from "@/shared/types/document/document-source";
import type { MortgageDraft } from "@mybookkeeper/api-client/types/mortgage/mortgage-draft";
import { MORTGAGE_INPUT_CLASS } from "./mortgage-input-class";

export interface MortgageDocumentReaderProps {
  onRead: (draft: MortgageDraft) => void;
}

/**
 * Fill the mortgage form from a statement.
 *
 * A monthly statement is the document that exists for every loan and arrives
 * on its own — unlike a closing package, which is filed once and then lost.
 * The balance and the payment split move every month, and those are exactly
 * the fields the comparison needs to be current.
 */
export default function MortgageDocumentReader({
  onRead,
}: MortgageDocumentReaderProps) {
  const [extractMortgage, { isLoading: isReadingDocument }] =
    useExtractMortgageMutation();
  const [extractUpload, { isLoading: isReadingUpload }] =
    useExtractMortgageFromUploadMutation();

  async function read(source: DocumentSource) {
    if (source.kind === "file") {
      const form = new FormData();
      form.append("file", source.file);
      onRead(await extractUpload(form).unwrap());
      return;
    }
    onRead(await extractMortgage({ document_id: source.documentId }).unwrap());
  }

  return (
    <DocumentReaderCard
      title="Read it off a statement"
      hint="Your latest monthly mortgage statement — PDF, photo, Word or spreadsheet."
      read={read}
      isReading={isReadingDocument || isReadingUpload}
      testIdPrefix="mortgage"
      inputClass={MORTGAGE_INPUT_CLASS}
    />
  );
}
