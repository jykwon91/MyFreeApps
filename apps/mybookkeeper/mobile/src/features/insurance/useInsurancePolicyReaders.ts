import {
  useExtractInsurancePolicyFromUploadMutation,
  useExtractInsurancePolicyMutation,
} from "@mybookkeeper/api-client/store/insurancePoliciesApi";
import type { InsurancePolicyDraft } from "@mybookkeeper/api-client/types/insurance/insurance-policy-draft";
import { filePart } from "../../lib/filePart";
import type { DocumentReaders } from "../../types/DocumentReaders";

/** How a document gets read into a policy: picked just now, or already in the library. */
export function useInsurancePolicyReaders(): DocumentReaders<InsurancePolicyDraft> {
  const [extractUpload] = useExtractInsurancePolicyFromUploadMutation();
  const [extractLibrary] = useExtractInsurancePolicyMutation();
  return {
    fromFile: (file) => {
      const form = new FormData();
      form.append("file", filePart(file));
      return extractUpload(form).unwrap();
    },
    fromLibrary: (documentId) => extractLibrary({ document_id: documentId }).unwrap(),
  };
}
