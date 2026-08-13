import { useState } from "react";
import { LoadingButton } from "@platform/ui";
import { showError } from "@/shared/lib/toast-store";
import { readDocumentErrorMessage } from "@/shared/lib/document-read-errors";
import { useGetDocumentsQuery } from "@/shared/store/documentsApi";
import type { DocumentSource } from "@/shared/types/document/document-source";
import ChosenDocument from "./ChosenDocument";
import DocumentFileDropzone from "./DocumentFileDropzone";
import DocumentLibraryPicker from "./DocumentLibraryPicker";

export interface DocumentReaderCardProps {
  /** Heading — names the paperwork this form can be read out of. */
  title: string;
  /** One line under it, naming the documents that actually work. */
  hint: string;
  /**
   * Read the picked document and fill the form. Rejecting with an object
   * carrying ``status`` is what selects the advice the operator is given.
   */
  read: (source: DocumentSource) => Promise<void>;
  isReading: boolean;
  /** Namespaces the test ids so each domain's specs address their own card. */
  testIdPrefix: string;
  /** The owning dialog's input styling — each domain keeps its own constant. */
  inputClass: string;
}

/**
 * Fill a form from a document.
 *
 * Uploading here does not go through ``POST /documents/upload``: that endpoint
 * queues the transaction extractor, and a document with a price printed on it
 * — an Electricity Facts Label, an insurance declarations page — run through
 * it would mint a junk transaction. The read endpoints store the file as
 * reference material instead, so it lands in the library and the saved row
 * cites it, without ever being mistaken for a payment.
 *
 * Picking a document reads it. There is no confirm step: the card exists to
 * fill the form, so a picked document the operator then has to press a second
 * button to act on is a step that only ever had one sensible answer. The file
 * is uploaded as part of that read rather than on sight, so abandoning the
 * dialog before picking leaves nothing behind and the read is a single request
 * either way. That matters on a phone, which is where this is mostly used.
 *
 * The button only comes back when a read fails, as a way to retry the same
 * document without re-picking it.
 */
export default function DocumentReaderCard({
  title,
  hint,
  read,
  isReading,
  testIdPrefix,
  inputClass,
}: DocumentReaderCardProps) {
  const { data: documents = [] } = useGetDocumentsQuery({ excludeProcessing: true });
  const [source, setSource] = useState<DocumentSource | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  async function attempt(target: DocumentSource) {
    setHasFailed(false);
    try {
      await read(target);
    } catch (e: unknown) {
      setHasFailed(true);
      showError(readDocumentErrorMessage((e as { status?: number }).status));
    }
  }

  /** Picking is the whole interaction — take the document and read it. */
  function pick(target: DocumentSource) {
    setSource(target);
    void attempt(target);
  }

  return (
    <div className="rounded-md border p-3 space-y-3" data-testid={`${testIdPrefix}-document-reader`}>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p>
      </div>

      {source ? (
        <ChosenDocument
          source={source}
          onClear={() => {
            setSource(null);
            setHasFailed(false);
          }}
          isReading={isReading}
          testIdPrefix={testIdPrefix}
        />
      ) : (
        <>
          <DocumentFileDropzone
            onFile={(file) => pick({ kind: "file", file })}
            disabled={isReading}
            testIdPrefix={testIdPrefix}
          />
          {documents.length > 0 && (
            <DocumentLibraryPicker
              documents={documents}
              onPick={(documentId, name) => pick({ kind: "library", documentId, name })}
              disabled={isReading}
              testIdPrefix={testIdPrefix}
              inputClass={inputClass}
            />
          )}
        </>
      )}

      {hasFailed && source && (
        <LoadingButton
          type="button"
          variant="secondary"
          size="md"
          isLoading={isReading}
          loadingText="Reading..."
          disabled={isReading}
          onClick={() => void attempt(source)}
          data-testid={`${testIdPrefix}-read-document-button`}
        >
          Try reading it again
        </LoadingButton>
      )}
    </div>
  );
}
