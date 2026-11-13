import { documentsApi } from "@mybookkeeper/api-client/store/documentsApi";
import type { ApiError } from "@platform/core/types/api-error";
import {
  FILE_REJECTED_STATUSES,
  LIMIT_REACHED_STATUS,
  SERVER_ERROR_STATUS,
  UPLOAD_TIMEOUT_MS,
} from "../../constants/capture";
import type { AppDispatch, RootState } from "../../lib/store";
import type { PendingUpload } from "../../types/PendingUpload";
import type { UploadPhase } from "../../types/UploadPhase";
import { hasAiPermission } from "../aiPermission/aiPermission";
import { rejectionMessage } from "./rejectionMessage";
import { uploadForm } from "./uploadForm";
import { pendingUploads, removeFromQueue } from "./uploadQueueFiles";
import { uploadPhaseChanged, uploadRejected } from "./uploadsSlice";

let isDraining = false;

/** Gives up on a dead connection, or nothing else could send until the app restarts. */
async function send(upload: PendingUpload, workspaceId: string, dispatch: AppDispatch) {
  // Named here, so a send retried after a switch still goes to the file's own workspace.
  const request = dispatch(documentsApi.endpoints.uploadDocument.initiate({ form: uploadForm(upload), workspaceId }));
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
  while (getState().workspace.activeId === workspaceId) {
    const next = pendingUploads(workspaceId).find((upload) => !failed.has(upload.uri));
    if (!next) return failed.size > 0 ? "unreachable" : sentAny ? "sent" : "idle";
    // Asked before every file, so stopping takes effect at the next one.
    if (!hasAiPermission()) return "waitingForPermission";

    const result = await send(next, workspaceId, dispatch);
    if (!("error" in result)) {
      removeFromQueue(next);
      sentAny = true;
      continue;
    }
    const error = result.error as ApiError;
    const status = error.status;
    if (status === LIMIT_REACHED_STATUS) return "limitReached";
    if (status !== undefined && FILE_REJECTED_STATUSES.includes(status)) {
      dispatch(uploadRejected(rejectionMessage(next.name, error)));
      removeFromQueue(next);
    } else if (status !== undefined && status >= SERVER_ERROR_STATUS) {
      // It may be this file, so it mustn't hold up the ones behind it.
      failed.add(next.uri);
    } else {
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
    dispatch(uploadPhaseChanged(phase));
    if (getState().workspace.activeId !== workspaceId) void dispatch(drainUploadQueue());
  };
}
