import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { FileStatus } from "@/shared/types/document/file-status";

interface UploadState {
  fileName: string;
  status: FileStatus;
  documentId: string | null;
  batchId: string | null;
  batchTotal: number;
  multiUploadTotal: number;
  multiUploadCompleted: number;
  multiUploadFailed: number;
}

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
        status: "uploading",
        documentId: null,
        batchId: null,
        batchTotal: 1,
        multiUploadTotal: 0,
        multiUploadCompleted: 0,
        multiUploadFailed: 0,
      };
    },
    startMultiUpload(state, action: PayloadAction<{ total: number }>) {
      state.current = {
        fileName: `${action.payload.total} files`,
        status: "uploading",
        documentId: null,
        batchId: null,
        batchTotal: action.payload.total,
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
      state.current.status = "done";
    },
    uploadSucceeded(state, action: PayloadAction<{ documentId: string; batchId: string | null; batchTotal: number }>) {
      if (!state.current) return;
      state.current.status = "processing";
      state.current.documentId = action.payload.documentId;
      state.current.batchId = action.payload.batchId;
      state.current.batchTotal = action.payload.batchTotal;
    },
    uploadFailed(state) {
      if (!state.current) return;
      state.current.status = "error";
    },
    processingComplete(state) {
      if (!state.current) return;
      state.current.status = "done";
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
  restoreProcessing,
  dismiss,
} = documentUploadSlice.actions;

export default documentUploadSlice.reducer;
