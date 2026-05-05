import { useEffect, useRef } from "react";
import { Loader2, CheckCircle2, XCircle, Upload, RotateCcw, Camera } from "lucide-react";
import { useMediaQuery } from "@/shared/hooks/useMediaQuery";
import { useUploadDocumentMutation, useGetBatchStatusQuery, useGetSingleUploadStatusQuery, useGetDocumentsQuery, useCancelBatchMutation } from "@/shared/store/documentsApi";
import { baseApi } from "@/shared/store/baseApi";
import { isSupportedFile } from "@/shared/utils/file-upload";
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
  singleStatusCode: string | undefined;
  batchStatusReady: boolean;
}

function resolveUploadSubstatus(snap: UploadStateSnapshot): UploadSubstatus {
  const { status, fileName, batchId, multiUploadTotal, singleStatusCode, batchStatusReady } = snap;
  const isMulti = multiUploadTotal > 0;
  switch (status) {
    case "error":
      return fileName ? "error-named" : "error-anonymous";
    case "uploading":
      return isMulti ? "uploading-multi" : "uploading-single";
    case "processing":
      if (batchId && batchStatusReady) return "processing-batch";
      if (!batchId && singleStatusCode === "extracting") return "processing-extracting";
      return "processing-single";
    case "done":
      if (isMulti) return "done-multi";
      return batchId ? "done-batch" : "done-single";
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
      return `${fileName} — ${batchCompleted} of ${batchTotal} extracted${batchFailed > 0 ? ` (${batchFailed} failed)` : ""}…`;
    case "processing-extracting":
      return `${fileName} — Hmm, let me read this...`;
    case "processing-single":
      return `${fileName} — Processing…`;
    case "done-multi":
      return `${fileName} — ${multiUploadCompleted} of ${multiUploadTotal} uploaded${multiUploadFailed > 0 ? ` (${multiUploadFailed} failed)` : ""}`;
    case "done-batch":
      return `${fileName} — ${batchTotal} document${batchTotal !== 1 ? "s" : ""} processed`;
    case "done-single":
      return `${fileName} — Got it! Check your Transactions page for the extracted data.`;
  }
}

export default function DocumentUploadZone() {
  const isMobile = useMediaQuery("(pointer: coarse)");
  const dispatch = useAppDispatch();
  const { current: upload, dragging } = useAppSelector((s) => s.documentUpload);
  const [uploadDocument] = useUploadDocumentMutation();
  const [cancelBatch] = useCancelBatchMutation();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // --- Poll batch status for zip uploads ---
  const { data: batchStatus } = useGetBatchStatusQuery(upload?.batchId ?? "", {
    pollingInterval: upload?.status === "processing" && upload.batchId ? 3000 : 0,
    skip: !upload?.batchId || upload.status !== "processing",
  });

  // --- Poll single doc status for non-zip uploads ---
  const { data: singleStatus } = useGetSingleUploadStatusQuery(upload?.documentId ?? "", {
    pollingInterval: upload?.status === "processing" && !upload.batchId ? 3000 : 0,
    skip: !upload?.documentId || !!upload.batchId || upload.status !== "processing",
  });

  useEffect(() => {
    if (!upload || upload.status !== "processing") return;

    if (upload.batchId && batchStatus?.status === "done") {
      dispatch(processingComplete());
      dispatch(baseApi.util.invalidateTags(["Document", "Summary", "Transaction"]));
    }

    if (!upload.batchId && singleStatus?.status && !["processing", "extracting"].includes(singleStatus.status)) {
      dispatch(processingComplete());
      dispatch(baseApi.util.invalidateTags(["Document", "Summary", "Transaction"]));
    }
  }, [batchStatus, singleStatus, upload, dispatch]);

  // --- Restore processing state from documents on mount ---
  const restoredRef = useRef(false);
  const { data: documents } = useGetDocumentsQuery({ status: "processing" });

  useEffect(() => {
    if (restoredRef.current || upload || !documents) return;
    restoredRef.current = true;

    const processingDocs = documents.filter((d) => d.status === "processing" && d.source === "upload");
    if (processingDocs.length === 0) return;

    const batchId = processingDocs.find((d) => d.batch_id)?.batch_id ?? null;
    const firstDoc = processingDocs[0];

    if (batchId) {
      const batchDocs = documents.filter((d) => d.batch_id === batchId);
      dispatch(restoreProcessing({
        fileName: `${batchDocs.length} files`,
        status: "processing",
        documentId: firstDoc.id,
        batchId,
        batchTotal: batchDocs.length,
        multiUploadTotal: 0,
        multiUploadCompleted: 0,
        multiUploadFailed: 0,
      }));
    } else {
      dispatch(restoreProcessing({
        fileName: firstDoc.file_name || "Unknown file",
        status: "processing",
        documentId: firstDoc.id,
        batchId: null,
        batchTotal: 1,
        multiUploadTotal: 0,
        multiUploadCompleted: 0,
        multiUploadFailed: 0,
      }));
    }
  }, [documents, upload, dispatch]);

  function handleFile(file: File) {
    if (!isSupportedFile(file.name)) return;
    if (file.size === 0) {
      dispatch(startUpload("Empty files cannot be processed."));
      dispatch(uploadFailed());
      return;
    }
    if (upload?.status === "uploading" || upload?.status === "processing") return;

    dispatch(startUpload(file.name));

    uploadDocument({ file })
      .unwrap()
      .then(({ document_id, batch_id, batch_total }) => {
        dispatch(uploadSucceeded({ documentId: document_id, batchId: batch_id, batchTotal: batch_total }));
      })
      .catch(() => {
        dispatch(uploadFailed());
      });
  }

  async function handleFiles(files: File[]) {
    const supported = files.filter((f) => isSupportedFile(f.name) && f.size > 0);
    if (supported.length === 0) return;
    if (supported.length === 1) {
      handleFile(supported[0]);
      return;
    }

    dispatch(startMultiUpload({ total: supported.length }));

    for (const file of supported) {
      try {
        await uploadDocument({ file }).unwrap();
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
    if (upload?.status === "uploading" || upload?.status === "processing") return;
    handleFiles(files);
  }

  const isActive = upload?.status === "uploading" || upload?.status === "processing";
  const isMultiUpload = upload?.multiUploadTotal !== undefined && upload.multiUploadTotal > 0;

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
        batchFailed: batchStatus?.failed ?? 0,
      })
    : null;

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); dispatch(setDragging(true)); }}
        onDragLeave={() => dispatch(setDragging(false))}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg px-6 py-12 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border"
        } ${isActive ? "opacity-50 pointer-events-none" : ""}`}
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
            accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.zip"
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

      {upload ? (
        <div className="border rounded-lg px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {(upload.status === "uploading" || upload.status === "processing") && (
                <Loader2 size={14} className="animate-spin text-primary shrink-0" />
              )}
              {upload.status === "done" && (
                <CheckCircle2 size={14} className="text-green-600 shrink-0" />
              )}
              {upload.status === "error" && (
                <XCircle size={14} className="text-destructive shrink-0" />
              )}
              <span className={`truncate ${upload.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                {statusText}
              </span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {upload.status === "processing" && upload.batchId && (
                <button
                  onClick={() => {
                    cancelBatch(upload.batchId!).unwrap().then(() => {
                      dispatch(dismiss());
                      dispatch(baseApi.util.invalidateTags(["Document", "Summary"]));
                    });
                  }}
                  className="text-xs text-muted-foreground hover:text-destructive font-medium"
                >
                  Cancel
                </button>
              )}
              {upload.status === "error" && (
                <button onClick={() => dispatch(dismiss())} className="p-1 text-muted-foreground hover:text-foreground" title="Try again">
                  <RotateCcw size={13} />
                </button>
              )}
              {!isActive && (
                <button onClick={() => dispatch(dismiss())} className="p-1 text-muted-foreground hover:text-destructive" title="Dismiss">
                  <XCircle size={13} />
                </button>
              )}
            </div>
          </div>
          {upload.status === "uploading" && isMultiUpload ? (
            <div className="mt-2">
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${upload.multiUploadTotal > 0 ? (upload.multiUploadCompleted / upload.multiUploadTotal) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : null}
          {upload.status === "processing" && upload.batchId && batchStatus ? (
            <div className="mt-2">
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-500"
                  style={{ width: `${batchStatus.total > 0 ? (batchStatus.completed / batchStatus.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
