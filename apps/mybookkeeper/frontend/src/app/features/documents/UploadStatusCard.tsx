import { Loader2, CheckCircle2, XCircle, RotateCcw, AlertTriangle } from "lucide-react";
import { LoadingButton, ProgressBar, cn } from "@platform/ui";
import type { BatchStatusResponse } from "@mybookkeeper/api-client/types/document/BatchStatusResponse";
import { FILE_STATUSES } from "@/shared/types/document/file-status";
import type { UploadState } from "@/shared/types/document/upload-state";
import { progressPercent } from "@mybookkeeper/api-client/utils/progressPercent";

export interface UploadStatusCardProps {
  upload: UploadState | null;
  statusText: string | null;
  batchStatus: BatchStatusResponse | undefined;
  onCancelBatch: (batchId: string) => void;
  isCancellingBatch: boolean;
  onDismiss: () => void;
}

/** The card under the drop zone that reports how the current upload is going. */
export default function UploadStatusCard({ upload, statusText, batchStatus, onCancelBatch, isCancellingBatch, onDismiss }: UploadStatusCardProps) {
  if (!upload) return null;

  const isActive = upload.status === FILE_STATUSES.UPLOADING || upload.status === FILE_STATUSES.PROCESSING;
  const isError = upload.status === FILE_STATUSES.ERROR || upload.status === FILE_STATUSES.FAILED;
  const isDone = upload.status === FILE_STATUSES.DONE;
  const isPartial = isDone && (upload.batchFailed > 0 || upload.multiUploadFailed > 0);
  const batchId = upload.batchId;

  return (
    <div role="status" className="border rounded-lg px-3 py-2 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {isActive && <Loader2 size={14} className="animate-spin text-primary shrink-0" />}
          {isDone && !isPartial && <CheckCircle2 size={14} className="text-green-600 shrink-0" />}
          {isPartial && <AlertTriangle size={14} className="text-amber-600 shrink-0" role="img" aria-label="Some files failed" />}
          {upload.status === FILE_STATUSES.SKIPPED && <CheckCircle2 size={14} className="text-muted-foreground shrink-0" />}
          {isError && <XCircle size={14} className="text-destructive shrink-0" role="img" aria-label="Upload failed" />}
          <span className={cn(isError || isPartial ? "break-words" : "truncate", isError ? "text-destructive" : "text-muted-foreground")}>
            {statusText}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {upload.status === FILE_STATUSES.PROCESSING && batchId && (
            <LoadingButton
              variant="ghost"
              size="sm"
              isLoading={isCancellingBatch}
              loadingText="Cancelling…"
              onClick={() => onCancelBatch(batchId)}
            >
              Cancel
            </LoadingButton>
          )}
          {upload.status === FILE_STATUSES.ERROR && (
            <button onClick={onDismiss} className="p-1 text-muted-foreground hover:text-foreground" title="Try again">
              <RotateCcw size={13} />
            </button>
          )}
          {!isActive && (
            <button onClick={onDismiss} className="p-1 text-muted-foreground hover:text-destructive" title="Dismiss">
              <XCircle size={13} />
            </button>
          )}
        </div>
      </div>
      {upload.status === FILE_STATUSES.UPLOADING && upload.multiUploadTotal > 0 && (
        <ProgressBar
          className="mt-2 h-1.5"
          value={progressPercent(upload.multiUploadCompleted, upload.multiUploadTotal)}
          label={`${upload.multiUploadCompleted} of ${upload.multiUploadTotal} files uploaded`}
        />
      )}
      {upload.status === FILE_STATUSES.PROCESSING && batchId && batchStatus && (
        <ProgressBar
          className="mt-2 h-1.5"
          value={progressPercent(batchStatus.completed, batchStatus.total)}
          label={`${batchStatus.completed} of ${batchStatus.total} files read`}
        />
      )}
    </div>
  );
}
