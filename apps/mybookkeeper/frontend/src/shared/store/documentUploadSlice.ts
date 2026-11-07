import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { FILE_STATUSES } from "@/shared/types/document/file-status";
import type { UploadState } from "@/shared/types/document/upload-state";
import type { UploadOutcome } from "@/shared/types/document/upload-outcome";

interface DocumentUploadSliceState {
  current: UploadState | null;
  dragging: boolean;
}

const initialState: DocumentUploadSliceState = {
  current: null,
  dragging: false,
};

const documentUploadSlice = createSlice({
  name: "documentUpload",
  initialState,
  reducers: {
    setDragging(state, action: PayloadAction<boolean>) {
      state.dragging = action.payload;
    },
    startUpload(state, action: PayloadAction<string>) {
      state.current = {
        fileName: action.payload,
        status: FILE_STATUSES.UPLOADING,
        documentId: null,
        batchId: null,
        batchTotal: 1,
        batchFailed: 0,
        multiUploadTotal: 0,
        multiUploadCompleted: 0,
        multiUploadFailed: 0,
      };
    },
    startMultiUpload(state, action: PayloadAction<{ total: number }>) {
      state.current = {
        fileName: `${action.payload.total} files`,
        status: FILE_STATUSES.UPLOADING,
        documentId: null,
        batchId: null,
        batchTotal: action.payload.total,
        batchFailed: 0,
        multiUploadTotal: action.payload.total,
        multiUploadCompleted: 0,
        multiUploadFailed: 0,
      };
    },
    multiUploadFileCompleted(state) {
      if (!state.current) return;
      state.current.multiUploadCompleted += 1;
    },
    multiUploadFileFailed(state) {
      if (!state.current) return;
      state.current.multiUploadFailed += 1;
    },
    multiUploadDone(state) {
      if (!state.current) return;
      state.current.status = state.current.multiUploadCompleted === 0 ? FILE_STATUSES.FAILED : FILE_STATUSES.DONE;
    },
    uploadSucceeded(state, action: PayloadAction<{ documentId: string; batchId: string | null; batchTotal: number }>) {
      if (!state.current) return;
      state.current.status = FILE_STATUSES.PROCESSING;
      state.current.documentId = action.payload.documentId;
      state.current.batchId = action.payload.batchId;
      state.current.batchTotal = action.payload.batchTotal;
    },
    uploadFailed(state) {
      if (!state.current) return;
      state.current.status = FILE_STATUSES.ERROR;
    },
    processingComplete(state, action: PayloadAction<UploadOutcome>) {
      if (!state.current) return;
      state.current.status = action.payload;
    },
    batchProcessed(state, action: PayloadAction<{ total: number; failed: number }>) {
      if (!state.current) return;
      const { total, failed } = action.payload;
      state.current.status = total > 0 && failed >= total ? FILE_STATUSES.FAILED : FILE_STATUSES.DONE;
      state.current.batchTotal = total;
      state.current.batchFailed = failed;
    },
    restoreProcessing(state, action: PayloadAction<UploadState>) {
      state.current = action.payload;
    },
    dismiss(state) {
      state.current = null;
    },
  },
});

export const {
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
} = documentUploadSlice.actions;

export default documentUploadSlice.reducer;
