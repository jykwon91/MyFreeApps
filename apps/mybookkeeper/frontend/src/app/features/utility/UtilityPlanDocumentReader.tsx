import { useState } from "react";
import { LoadingButton } from "@platform/ui";
import { showError } from "@/shared/lib/toast-store";
import { readDocumentErrorMessage } from "@/shared/lib/utility-plan-read-errors";
import { useGetDocumentsQuery } from "@/shared/store/documentsApi";
import {
  useExtractUtilityPlanFromUploadMutation,
  useExtractUtilityPlanMutation,
} from "@/shared/store/utilityPlansApi";
import type { UtilityPlanDocumentSource } from "@/shared/types/utility/utility-plan-document-source";
import type { UtilityPlanDraft } from "@/shared/types/utility/utility-plan-draft";
import UtilityPlanChosenDocument from "./UtilityPlanChosenDocument";
import UtilityPlanFileDropzone from "./UtilityPlanFileDropzone";
import UtilityPlanLibraryPicker from "./UtilityPlanLibraryPicker";

export interface UtilityPlanDocumentReaderProps {
  onRead: (draft: UtilityPlanDraft) => void;
}

/**
 * Fill the form from a document.
 *
 * Uploading here does not go through ``POST /documents/upload``: that endpoint
 * queues the transaction extractor, and an Electricity Facts Label run through
 * it would mint a junk transaction against the property. The read endpoint
 * stores the file as reference material instead, so it lands in the library
 * — the saved plan cites it — without ever being mistaken for a payment.
 *
 * A picked file is held until "Read the terms" is pressed rather than uploaded
 * on sight, so abandoning the dialog leaves nothing behind and the read is a
 * single request either way. That matters on a phone, which is where this is
 * mostly used.
 */
export default function UtilityPlanDocumentReader({
  onRead,
}: UtilityPlanDocumentReaderProps) {
  const { data: documents = [] } = useGetDocumentsQuery({ excludeProcessing: true });
  const [extractPlan, { isLoading: isReadingLibrary }] = useExtractUtilityPlanMutation();
  const [extractUpload, { isLoading: isReadingUpload }] =
    useExtractUtilityPlanFromUploadMutation();
  const [source, setSource] = useState<UtilityPlanDocumentSource | null>(null);

  const isReading = isReadingLibrary || isReadingUpload;

  async function handleRead() {
    if (!source) return;
    try {
      onRead(
        source.kind === "file"
          ? await extractUpload(source.file).unwrap()
          : await extractPlan({ document_id: source.documentId }).unwrap(),
      );
    } catch (e: unknown) {
      showError(readDocumentErrorMessage((e as { status?: number }).status));
    }
  }

  return (
    <div className="rounded-md border p-3 space-y-3" data-testid="utility-plan-document-reader">
      <div>
        <p className="text-sm font-medium">Start from a document</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Add an Electricity Facts Label, a contract, or a bill and I'll fill in
          what I can.
        </p>
      </div>

      {source ? (
        <UtilityPlanChosenDocument
          source={source}
          onClear={() => setSource(null)}
          disabled={isReading}
        />
      ) : (
        <>
          <UtilityPlanFileDropzone
            onFile={(file) => setSource({ kind: "file", file })}
            disabled={isReading}
          />
          {documents.length > 0 && (
            <UtilityPlanLibraryPicker
              documents={documents}
              onPick={(documentId, name) =>
                setSource({ kind: "library", documentId, name })
              }
              disabled={isReading}
            />
          )}
        </>
      )}

      <LoadingButton
        type="button"
        variant="secondary"
        size="md"
        isLoading={isReading}
        loadingText="Reading..."
        disabled={isReading || !source}
        onClick={() => void handleRead()}
        data-testid="utility-plan-read-document-button"
      >
        Read the terms
      </LoadingButton>
    </div>
  );
}
