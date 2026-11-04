import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const initialState: { activeId: string | null } = { activeId: null };

const workspaceSlice = createSlice({
  name: "workspace",
  initialState,
  reducers: {
    workspaceChosen(state, { payload }: PayloadAction<string | null>) {
      state.activeId = payload;
    },
  },
});

export const { workspaceChosen } = workspaceSlice.actions;
export default workspaceSlice.reducer;
