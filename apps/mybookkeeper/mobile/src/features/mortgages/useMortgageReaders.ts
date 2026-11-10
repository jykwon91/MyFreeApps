import { filePart } from "@platform/mobile";
import {
  useExtractMortgageFromUploadMutation,
  useExtractMortgageMutation,
} from "@mybookkeeper/api-client/store/mortgagesApi";
import type { MortgageDraft } from "@mybookkeeper/api-client/types/mortgage/mortgage-draft";
import type { DocumentReaders } from "../../types/DocumentReaders";

/** How a statement gets read into a loan: picked just now, or already in the library. */
export function useMortgageReaders(): DocumentReaders<MortgageDraft> {
  const [extractUpload] = useExtractMortgageFromUploadMutation();
  const [extractLibrary] = useExtractMortgageMutation();
  return {
    fromFile: (file) => {
      const form = new FormData();
      form.append("file", filePart(file));
      return extractUpload(form).unwrap();
    },
    fromLibrary: (documentId) => extractLibrary({ document_id: documentId }).unwrap(),
  };
}
