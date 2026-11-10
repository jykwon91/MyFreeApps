import { filePart } from "@platform/mobile";
import {
  useExtractUtilityPlanFromUploadMutation,
  useExtractUtilityPlanMutation,
} from "@mybookkeeper/api-client/store/utilityPlansApi";
import type { UtilityPlanDraft } from "@mybookkeeper/api-client/types/utility/utility-plan-draft";
import type { DocumentReaders } from "../../types/DocumentReaders";

/** How a document gets read into a plan: picked just now, or already in the library. */
export function useUtilityPlanReaders(): DocumentReaders<UtilityPlanDraft> {
  const [extractUpload] = useExtractUtilityPlanFromUploadMutation();
  const [extractLibrary] = useExtractUtilityPlanMutation();
  return {
    fromFile: (file) => {
      const form = new FormData();
      form.append("file", filePart(file));
      return extractUpload(form).unwrap();
    },
    fromLibrary: (documentId) => extractLibrary({ document_id: documentId }).unwrap(),
  };
}
