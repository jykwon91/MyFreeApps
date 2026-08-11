import { useState } from "react";
import { LoadingButton } from "@platform/ui";
import FormField from "@/shared/components/ui/FormField";
import { showError } from "@/shared/lib/toast-store";
import { useGetDocumentsQuery } from "@/shared/store/documentsApi";
import { useExtractUtilityPlanMutation } from "@/shared/store/utilityPlansApi";
import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";
import { UTILITY_PLAN_INPUT_CLASS } from "./UtilityPlanFormFields";

export interface UtilityPlanDocumentReaderProps {
  onRead: (draft: UtilityPlanDraft) => void;
}

/**
 * Fill the form from a document already in the library.
 *
 * It reads an existing document rather than uploading a new one on the spot,
 * and that is deliberate: ``POST /documents/upload`` enqueues the transaction
 * extractor, so uploading an Electricity Facts Label here would mint a junk
 * transaction against the property. The operator uploads on the Documents page
 * as usual, then points this at the file.
 */
export default function UtilityPlanDocumentReader({
  onRead,
}: UtilityPlanDocumentReaderProps) {
  const { data: documents = [] } = useGetDocumentsQuery({ excludeProcessing: true });
  const [extractPlan, { isLoading }] = useExtractUtilityPlanMutation();
  const [documentId, setDocumentId] = useState("");

  async function handleRead() {
    if (!documentId) {
      showError("Pick a document first.");
      return;
    }
    try {
      onRead(await extractPlan({ document_id: documentId }).unwrap());
    } catch {
      showError("I couldn't read that one. Try another file, or fill it in by hand.");
    }
  }

  return (
    <div className="rounded-md border p-3 space-y-3" data-testid="utility-plan-document-reader">
      <div>
        <p className="text-sm font-medium">Start from a document</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Point me at an Electricity Facts Label, a contract, or a bill and I'll fill
          in what I can. Upload it on the Documents page first if it isn't here yet.
        </p>
      </div>

      <FormField label="Document">
        <select
          value={documentId}
          onChange={(e) => setDocumentId(e.target.value)}
          className={UTILITY_PLAN_INPUT_CLASS}
          data-testid="utility-plan-document-select"
        >
          <option value="">Select a document…</option>
          {documents.map((document) => (
            <option key={document.id} value={document.id}>
              {document.file_name ?? "Untitled document"}
            </option>
          ))}
        </select>
      </FormField>

      <LoadingButton
        type="button"
        variant="secondary"
        size="md"
        isLoading={isLoading}
        loadingText="Reading..."
        disabled={isLoading || !documentId}
        onClick={() => void handleRead()}
        data-testid="utility-plan-read-document-button"
      >
        Read the terms
      </LoadingButton>
    </div>
  );
}
