import { documentUploadForm } from "@/shared/lib/document-upload-form";
import { useEffect, useRef } from "react";
import { Upload, Camera } from "lucide-react";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";
import { useUploadDocumentMutation, useGetBatchStatusQuery, useGetSingleUploadStatusQuery, useGetDocumentsQuery, useCancelBatchMutation } from "@mybookkeeper/api-client/store/documentsApi";
import { baseApi } from "@/shared/store/baseApi";
import { DOCUMENT_UPLOAD_ACCEPT } from "@mybookkeeper/api-client/constants/documentUpload";
import { documentUploadProblem, documentUploadProblemMessage, isSupportedDocumentUpload } from "@mybookkeeper/api-client/utils/documentUploadFile";
import { uploadOutcome } from "@/shared/utils/upload-outcome";
import { cn, showError } from "@platform/ui";
import UploadStatusCard from "./UploadStatusCard";
import { DOCUMENT_UPLOAD_MESSAGES } from "@/shared/lib/document-upload-messages";
import { DOCUMENT_STATUSES, type DocumentStatus } from "@mybookkeeper/api-client/types/document/DocumentStatus";
import { BATCH_STATUSES } from "@mybookkeeper/api-client/types/document/BatchStatus";
import { FILE_STATUSES } from "@/shared/types/document/file-status";
import { useAppDispatch, useAppSelector } from "@/shared/store/hooks";
import {
  setDragging,
  startUpload,
  startMultiUpload,
  multiUploadFileCompleted,
  multiUploadFileFailed,
  multiUploadDone,
  uploadSucceeded,
  uploadFailed,
  processingComplete,
  batchProcessed,
  restoreProcessing,
  dismiss,
} from "@/shared/store/documentUploadSlice";
import type { FileStatus } from "@/shared/types/document/file-status";
import type { UploadSubstatus } from "@/shared/types/document/upload-substatus";

interface UploadStateSnapshot {
  status: FileStatus;
  fileName: string;
  batchId: string | null;
  multiUploadTotal: number;
  singleStatusCode: DocumentStatus | undefined;
  batchStatusReady: boolean;
}

function resolveUploadSubstatus(snap: UploadStateSnapshot): UploadSubstatus {
  const { status, fileName, batchId, multiUploadTotal, singleStatusCode, batchStatusReady } = snap;
  const isMulti = multiUploadTotal > 0;
  switch (status) {
    case FILE_STATUSES.ERROR:
      return fileName ? "error-named" : "error-anonymous";
    case FILE_STATUSES.UPLOADING:
      return isMulti ? "uploading-multi" : "uploading-single";
    case FILE_STATUSES.PROCESSING:
      if (batchId && batchStatusReady) return "processing-batch";
      if (!batchId && singleStatusCode === DOCUMENT_STATUSES.EXTRACTING) return "processing-extracting";
      return "processing-single";
    case FILE_STATUSES.DONE:
      if (isMulti) return "done-multi";
      return batchId ? "done-batch" : "done-single";
    case FILE_STATUSES.FAILED:
      if (isMulti) return "failed-multi";
      return batchId ? "failed-batch" : "failed-single";
    case FILE_STATUSES.SKIPPED:
      return "skipped-single";
  }
}

interface UploadStatusTextArgs {
  substatus: UploadSubstatus;
  fileName: string;
  multiUploadCompleted: number;
  multiUploadTotal: number;
  multiUploadFailed: number;
  batchTotal: number;
  batchCompleted: number;
  batchFailed: number;
}

function resolveUploadStatusText(args: UploadStatusTextArgs): string {
  const {
    substatus,
    fileName,
    multiUploadCompleted,
    multiUploadTotal,
    multiUploadFailed,
    batchTotal,
    batchCompleted,
    batchFailed,
  } = args;
  switch (substatus) {
    case "error-anonymous":
      return "Something went wrong. Please try again.";
    case "error-named":
      return fileName;
    case "uploading-multi":
      return `${fileName} — Uploading ${multiUploadCompleted + 1} of ${multiUploadTotal}…`;
    case "uploading-single":
      return `${fileName} — Uploading…`;
    case "processing-batch":
      return `${fileName} — ${batchCompleted - batchFailed} of ${batchTotal} extracted${batchFailed > 0 ? ` (${batchFailed} failed)` : ""}…`;
    case "processing-extracting":
      return `${fileName} — Hmm, let me read this...`;
    case "processing-single":
      return `${fileName} — Processing…`;
    case "done-multi":
      return `${fileName} — ${multiUploadCompleted} of ${multiUploadTotal} uploaded${multiUploadFailed > 0 ? ` (${multiUploadFailed} failed)` : ""}`;
    case "done-batch":
      if (batchFailed === 0) return `${fileName} — ${batchTotal} document${batchTotal !== 1 ? "s" : ""} processed`;
      return batchFailed === 1
        ? `${fileName} — I read ${batchTotal - 1} of ${batchTotal}, but had trouble with 1. Want me to try that one again? It's in the list below.`
        : `${fileName} — I read ${batchTotal - batchFailed} of ${batchTotal}, but had trouble with ${batchFailed}. Want me to try those again? They're in the list below.`;
    case "done-single":
      return `${fileName} — Got it! Check your Transactions page for the extracted data.`;
    case "failed-multi":
      return `${fileName} — I couldn't upload any of these. Please try again.`;
    case "failed-batch":
      return `${fileName} — I had trouble reading all ${batchTotal} of these. Want me to try again? They're in the list below.`;
    case "failed-single":
      return `${fileName} — I had trouble reading this one. You can have me try again from the list below.`;
    case "skipped-single":
      return `${fileName} — I read it, but there was nothing new to add to your transactions.`;
  }
}

export default function DocumentUploadZone() {
  const isMobile = useMediaQuery("(pointer: coarse)");
  const dispatch = useAppDispatch();
  const { current: upload, dragging } = useAppSelector((s) => s.documentUpload);
  const [uploadDocument] = useUploadDocumentMutation();
  const [cancelBatch, { isLoading: isCancellingBatch }] = useCancelBatchMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // --- Poll batch status for zip uploads ---
  const { currentData: batchStatus } = useGetBatchStatusQuery(upload?.batchId ?? "", {
    pollingInterval: upload?.status === FILE_STATUSES.PROCESSING && upload.batchId ? 3000 : 0,
    skip: !upload?.batchId || upload.status !== FILE_STATUSES.PROCESSING,
  });

  // --- Poll single doc status for non-zip uploads ---
  const { currentData: singleStatus } = useGetSingleUploadStatusQuery(upload?.documentId ?? "", {
    pollingInterval: upload?.status === FILE_STATUSES.PROCESSING && !upload.batchId ? 3000 : 0,
    skip: !upload?.documentId || !!upload.batchId || upload.status !== FILE_STATUSES.PROCESSING,
  });

  useEffect(() => {
    if (!upload || upload.status !== FILE_STATUSES.PROCESSING) return;

    if (upload.batchId && batchStatus?.status === BATCH_STATUSES.DONE) {
      dispatch(batchProcessed({ total: batchStatus.total, failed: batchStatus.failed }));
      dispatch(baseApi.util.invalidateTags(["Document", "Summary", "Transaction"]));
    }

    const outcome = !upload.batchId && singleStatus ? uploadOutcome(singleStatus.status) : null;
    if (outcome) {
      dispatch(processingComplete(outcome));
      dispatch(baseApi.util.invalidateTags(["Document", "Summary", "Transaction"]));
    }
  }, [batchStatus, singleStatus, upload, dispatch]);

  // --- Restore processing state from documents on mount ---
  const restoredRef = useRef(false);
  const { data: documents } = useGetDocumentsQuery({ status: DOCUMENT_STATUSES.PROCESSING });

  useEffect(() => {
    if (restoredRef.current || upload || !documents) return;
    restoredRef.current = true;

    const processingDocs = documents.filter((d) => d.status === DOCUMENT_STATUSES.PROCESSING && d.source === "upload");
    if (processingDocs.length === 0) return;

    const batchId = processingDocs.find((d) => d.batch_id)?.batch_id ?? null;
    const firstDoc = processingDocs[0];

    if (batchId) {
      const batchDocs = documents.filter((d) => d.batch_id === batchId);
      dispatch(restoreProcessing({
        // The zip's own name isn't stored, and finished documents aren't in this list.
        fileName: "Your zip",
        status: FILE_STATUSES.PROCESSING,
        documentId: firstDoc.id,
        batchId,
        batchTotal: batchDocs.length,
        batchFailed: 0,
        multiUploadTotal: 0,
        multiUploadCompleted: 0,
        multiUploadFailed: 0,
      }));
    } else {
      dispatch(restoreProcessing({
        fileName: firstDoc.file_name || "Unknown file",
        status: FILE_STATUSES.PROCESSING,
        documentId: firstDoc.id,
        batchId: null,
        batchTotal: 1,
        batchFailed: 0,
        multiUploadTotal: 0,
        multiUploadCompleted: 0,
        multiUploadFailed: 0,
      }));
    }
  }, [documents, upload, dispatch]);

  function handleFile(file: File) {
    const problem = documentUploadProblem(file.name, file.size);
    if (problem === "unsupported") return;
    if (problem) {
      dispatch(startUpload(documentUploadProblemMessage(file.name, problem)));
      dispatch(uploadFailed());
      return;
    }
    if (upload?.status === FILE_STATUSES.UPLOADING || upload?.status === FILE_STATUSES.PROCESSING) return;

    dispatch(startUpload(file.name));

    uploadDocument({ form: documentUploadForm(file) })
      .unwrap()
      .then(({ document_id, batch_id, batch_total }) => {
        dispatch(uploadSucceeded({ documentId: document_id, batchId: batch_id, batchTotal: batch_total }));
      })
      .catch(() => {
        dispatch(uploadFailed());
      });
  }

  async function handleFiles(files: File[]) {
    const supported = files.filter((f) => isSupportedDocumentUpload(f.name) && f.size > 0);
    if (supported.length === 0) return;
    if (supported.length === 1) {
      handleFile(supported[0]);
      return;
    }

    dispatch(startMultiUpload({ total: supported.length }));

    for (const file of supported) {
      // Too big to get through, so it's counted as failed without spending the time to send it.
      if (documentUploadProblem(file.name, file.size)) {
        dispatch(multiUploadFileFailed());
        continue;
      }
      try {
        await uploadDocument({ form: documentUploadForm(file) }).unwrap();
        dispatch(multiUploadFileCompleted());
      } catch {
        dispatch(multiUploadFileFailed());
      }
    }

    dispatch(multiUploadDone());
    dispatch(baseApi.util.invalidateTags(["Document", "Summary", "Transaction"]));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dispatch(setDragging(false));
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    if (upload?.status === FILE_STATUSES.UPLOADING || upload?.status === FILE_STATUSES.PROCESSING) return;
    handleFiles(files);
  }

  const isActive = upload?.status === FILE_STATUSES.UPLOADING || upload?.status === FILE_STATUSES.PROCESSING;

  async function handleCancelBatch(batchId: string) {
    try {
      await cancelBatch(batchId).unwrap();
    } catch {
      showError(DOCUMENT_UPLOAD_MESSAGES.CANCEL_FAILED);
      return;
    }
    dispatch(dismiss());
    dispatch(baseApi.util.invalidateTags(["Document", "Summary"]));
  }

  const substatus = upload
    ? resolveUploadSubstatus({
        status: upload.status,
        fileName: upload.fileName,
        batchId: upload.batchId,
        multiUploadTotal: upload.multiUploadTotal,
        singleStatusCode: singleStatus?.status,
        batchStatusReady: !!(upload.batchId && batchStatus),
      })
    : null;

  const statusText = substatus && upload
    ? resolveUploadStatusText({
        substatus,
        fileName: upload.fileName,
        multiUploadCompleted: upload.multiUploadCompleted,
        multiUploadTotal: upload.multiUploadTotal,
        multiUploadFailed: upload.multiUploadFailed,
        batchTotal: upload.batchTotal,
        batchCompleted: batchStatus?.completed ?? 0,
        batchFailed: batchStatus?.failed ?? upload.batchFailed,
      })
    : null;

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); dispatch(setDragging(true)); }}
        onDragLeave={() => dispatch(setDragging(false))}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg px-6 py-12 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border",
          isActive && "opacity-50 pointer-events-none",
        )}
      >
        <div className="flex flex-col items-center gap-3">
          {isMobile ? (
            <button
              onClick={() => cameraRef.current?.click()}
              disabled={isActive}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
              Take Photo
            </button>
          ) : null}
          <div className="flex items-center gap-3">
            {!isMobile ? <Upload className="h-4 w-4 text-muted-foreground shrink-0" /> : null}
            <p className="text-sm text-muted-foreground">
              {isMobile ? "Or " : "Drag and drop a file, or "}
              <button
                onClick={() => inputRef.current?.click()}
                className="text-primary font-medium hover:underline"
                disabled={isActive}
              >
                browse files
              </button>
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            accept={DOCUMENT_UPLOAD_ACCEPT}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) handleFiles(files);
              e.target.value = "";
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            className="hidden"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) handleFiles(files);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <UploadStatusCard
        upload={upload}
        statusText={statusText}
        batchStatus={batchStatus}
        onCancelBatch={handleCancelBatch}
        isCancellingBatch={isCancellingBatch}
        onDismiss={() => dispatch(dismiss())}
      />
    </div>
  );
}
