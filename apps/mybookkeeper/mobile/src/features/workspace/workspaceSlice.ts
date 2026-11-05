import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { WorkspaceState } from "../../types/WorkspaceState";

const initialState: WorkspaceState = { activeId: null, lostWorkspace: null };

const workspaceSlice = createSlice({
  name: "workspace",
  initialState,
  reducers: {
    workspaceChosen(state, { payload }: PayloadAction<string | null>) {
      state.activeId = payload;
    },
    workspaceLost(state, { payload }: PayloadAction<{ from: string; to: string } | null>) {
      state.lostWorkspace = payload;
    },
  },
});

export const { workspaceChosen, workspaceLost } = workspaceSlice.actions;
export default workspaceSlice.reducer;
