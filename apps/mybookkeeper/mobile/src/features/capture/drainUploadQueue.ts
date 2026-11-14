import { documentsApi } from "@mybookkeeper/api-client/store/documentsApi";
import { progressPercent } from "@mybookkeeper/api-client/utils/progressPercent";
import type { UploadDocumentArgs } from "@mybookkeeper/api-client/types/document/UploadDocumentArgs";
import type { ApiError } from "@platform/core/types/api-error";
import {
  FILE_REJECTED_STATUSES,
  LIMIT_REACHED_STATUS,
  NETWORK_FAILURES_BEFORE_STOP,
  SERVER_ERROR_STATUS,
  UPLOAD_TIMEOUT_MS,
} from "../../constants/capture";
import type { AppDispatch, RootState } from "../../lib/store";
import type { PendingUpload } from "../../types/PendingUpload";
import type { UploadPhase } from "../../types/UploadPhase";
import { hasAiPermission } from "../aiPermission/aiPermission";
import { failedLast } from "./failedLast";
import { rejectionMessage } from "./rejectionMessage";
import { uploadForm } from "./uploadForm";
import { pendingUploads, removeFromQueue } from "./uploadQueueFiles";
import {
  uploadDrainEnded,
  uploadFileChanged,
  uploadFileProgressed,
  uploadFilesQueued,
  uploadPhaseChanged,
  uploadRejected,
} from "./uploadsSlice";

let isDraining = false;
/** Files that failed in an earlier drain, so they don't keep going first. Forgotten when the app restarts. */
const failedEarlier = new Set<string>();

function reportProgress(upload: PendingUpload, dispatch: AppDispatch): NonNullable<UploadDocumentArgs["onUploadProgress"]> {
  return ({ loaded, total }) => {
    // Without a total there's nothing to say how far along it is.
    if (total) dispatch(uploadFileProgressed({ uri: upload.uri, percent: Math.round(progressPercent(loaded, total)) }));
  };
}

/** Gives up on a dead connection, or nothing else could send until the app restarts. */
async function send(upload: PendingUpload, workspaceId: string, dispatch: AppDispatch) {
  // Named here, so a send retried after a switch still goes to the file's own workspace.
  const request = dispatch(
    documentsApi.endpoints.uploadDocument.initiate({
      form: uploadForm(upload),
      workspaceId,
      onUploadProgress: reportProgress(upload, dispatch),
    }),
  );
  const timer = setTimeout(() => request.abort(), UPLOAD_TIMEOUT_MS);
  try {
    return await request;
  } finally {
    clearTimeout(timer);
  }
}

async function sendAll(workspaceId: string, dispatch: AppDispatch, getState: () => RootState): Promise<UploadPhase> {
  const failed = new Set<string>();
  let sentAny = false;
  let networkFailuresInARow = 0;
  while (getState().workspace.activeId === workspaceId) {
    // Read each time round: files added while one is sending join the end of the line.
    const waiting = failedLast(
      pendingUploads(workspaceId).filter((upload) => !failed.has(upload.uri)),
      failedEarlier,
    );
    dispatch(uploadFilesQueued(waiting));
    const [next] = waiting;
    if (!next) return failed.size > 0 ? "unreachable" : sentAny ? "sent" : "idle";
    // Asked before every file, so stopping takes effect at the next one.
    if (!hasAiPermission()) return "waitingForPermission";

    dispatch(uploadFileChanged({ uri: next.uri, status: "uploading" }));
    const result = await send(next, workspaceId, dispatch);
    if (!("error" in result)) {
      removeFromQueue(next);
      failedEarlier.delete(next.uri);
      dispatch(uploadFileChanged({ uri: next.uri, status: "done" }));
      sentAny = true;
      networkFailuresInARow = 0;
      continue;
    }
    const error = result.error as ApiError;
    const status = error.status;
    if (status === LIMIT_REACHED_STATUS) {
      // Not this file's fault: it waits with the rest for tomorrow.
      dispatch(uploadFileChanged({ uri: next.uri, status: "queued" }));
      return "limitReached";
    }
    dispatch(uploadFileChanged({ uri: next.uri, status: "failed" }));
    if (status !== undefined && FILE_REJECTED_STATUSES.includes(status)) {
      dispatch(uploadRejected(rejectionMessage(next.name, error)));
      removeFromQueue(next);
      failedEarlier.delete(next.uri);
      networkFailuresInARow = 0;
    } else if (status !== undefined && status >= SERVER_ERROR_STATUS) {
      // It may be this file, so it mustn't hold up the ones behind it.
      failed.add(next.uri);
      failedEarlier.add(next.uri);
      networkFailuresInARow = 0;
    } else if (status === undefined) {
      // No answer at all: a file too big for a slow link looks the same as a dead connection.
      failed.add(next.uri);
      failedEarlier.add(next.uri);
      networkFailuresInARow += 1;
      if (networkFailuresInARow >= NETWORK_FAILURES_BEFORE_STOP) return "unreachable";
    } else {
      // Answered, but not about this file (signed out, not allowed): the same for every file.
      return "unreachable";
    }
  }
  return "idle";
}

/** Sends what's waiting, oldest first, one at a time. Files stay on disk until the server has them. */
export function drainUploadQueue() {
  return async (dispatch: AppDispatch, getState: () => RootState): Promise<void> => {
    const workspaceId = getState().workspace.activeId;
    if (!workspaceId || isDraining) return;

    if (pendingUploads(workspaceId).length === 0) {
      if (getState().uploads.phase === "waitingForPermission") dispatch(uploadPhaseChanged("idle"));
      return;
    }
    if (!hasAiPermission()) {
      dispatch(uploadPhaseChanged("waitingForPermission"));
      return;
    }

    let phase: UploadPhase = "unreachable";
    isDraining = true;
    dispatch(uploadPhaseChanged("sending"));
    try {
      phase = await sendAll(workspaceId, dispatch, getState);
    } catch {
      // Falls through with the phase above: the files are still there to retry.
    } finally {
      isDraining = false;
    }
    const isSameWorkspace = getState().workspace.activeId === workspaceId;
    dispatch(uploadDrainEnded(isSameWorkspace));
    dispatch(uploadPhaseChanged(phase));
    if (!isSameWorkspace) void dispatch(drainUploadQueue());
  };
}
