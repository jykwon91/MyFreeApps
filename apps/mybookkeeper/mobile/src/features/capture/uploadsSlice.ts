import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { PendingUpload } from "../../types/PendingUpload";
import type { UploadFilePercent } from "../../types/UploadFilePercent";
import type { UploadFileStatus } from "../../types/UploadFileStatus";
import type { UploadFileStatusChange } from "../../types/UploadFileStatusChange";
import type { UploadPhase } from "../../types/UploadPhase";
import type { UploadsState } from "../../types/UploadsState";

const initialState: UploadsState = { phase: "idle", rejections: [], files: [] };

function isFinished(status: UploadFileStatus): boolean {
  return status === "done" || status === "failed";
}

const uploadsSlice = createSlice({
  name: "uploads",
  initialState,
  reducers: {
    uploadPhaseChanged(state, { payload }: PayloadAction<UploadPhase>) {
      state.phase = payload;
    },
    uploadRejected(state, { payload }: PayloadAction<string>) {
      state.rejections.push(payload);
    },
    /** Lists what's about to be sent. One that failed last time is waiting again. */
    uploadFilesQueued(state, { payload }: PayloadAction<PendingUpload[]>) {
      for (const { uri, name } of payload) {
        const listed = state.files.find((file) => file.uri === uri);
        if (!listed) state.files.push({ uri, name, status: "queued", percent: null });
        else if (listed.status === "failed") Object.assign(listed, { status: "queued", percent: null });
      }
    },
    uploadFileChanged(state, { payload }: PayloadAction<UploadFileStatusChange>) {
      const listed = state.files.find((file) => file.uri === payload.uri);
      if (listed) Object.assign(listed, { status: payload.status, percent: null });
    },
    uploadFileProgressed(state, { payload }: PayloadAction<UploadFilePercent>) {
      const listed = state.files.find((file) => file.uri === payload.uri);
      if (listed?.status === "uploading") listed.percent = payload.percent;
    },
    /**
     * What wasn't sent this time is still on the phone, and the message under the list says why. Once another
     * workspace (or nobody) is chosen, none of these files are its to show.
     */
    uploadDrainEnded(state, { payload: isSameWorkspace }: PayloadAction<boolean>) {
      state.files = isSameWorkspace ? state.files.filter((file) => isFinished(file.status)) : [];
    },
    /** The "got it" message has been up long enough: it goes, and so do the files it was about. */
    uploadSentSettled(state) {
      if (state.phase === "sent") state.phase = "idle";
      state.files = state.files.filter((file) => file.status !== "done");
    },
    uploadStatusDismissed(state) {
      state.rejections = [];
      if (state.phase === "sending") {
        state.files = state.files.filter((file) => !isFinished(file.status));
      } else {
        state.files = [];
        state.phase = "idle";
      }
    },
    /** Signed out or moved to another workspace: nothing listed here is the next person's or workspace's to see. */
    uploadsReset() {
      return initialState;
    },
  },
});

export const {
  uploadDrainEnded,
  uploadFileChanged,
  uploadFileProgressed,
  uploadFilesQueued,
  uploadPhaseChanged,
  uploadRejected,
  uploadSentSettled,
  uploadStatusDismissed,
  uploadsReset,
} = uploadsSlice.actions;
export default uploadsSlice.reducer;
