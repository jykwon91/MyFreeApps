import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { UploadPhase } from "../../types/UploadPhase";
import type { UploadsState } from "../../types/UploadsState";

const initialState: UploadsState = { phase: "idle", rejections: [] };

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
    uploadStatusDismissed(state) {
      state.rejections = [];
      if (state.phase !== "sending") state.phase = "idle";
    },
  },
});

export const { uploadPhaseChanged, uploadRejected, uploadStatusDismissed } = uploadsSlice.actions;
export default uploadsSlice.reducer;
