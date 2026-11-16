import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SavedWorkspace } from "../../types/SavedWorkspace";
import type { WorkspaceState } from "../../types/WorkspaceState";

const initialState: WorkspaceState = { activeId: null, lostWorkspace: null, remembered: null };

const workspaceSlice = createSlice({
  name: "workspace",
  initialState,
  reducers: {
    workspaceChosen(state, { payload }: PayloadAction<string | null>) {
      state.activeId = payload;
      state.remembered = null;
    },
    /** Opens the workspace saved on this phone because the list of workspaces can't be reached. */
    workspaceRemembered(state, { payload }: PayloadAction<SavedWorkspace>) {
      state.activeId = payload.id;
      state.remembered = payload;
    },
    workspaceLost(state, { payload }: PayloadAction<{ from: string; to: string } | null>) {
      state.lostWorkspace = payload;
    },
  },
});

export const { workspaceChosen, workspaceLost, workspaceRemembered } = workspaceSlice.actions;
export default workspaceSlice.reducer;
