import { discoveryReadErrorMessage } from "@myrecipes/api-client/utils/discoveryReadErrorMessage";
import { discoverySearchErrorMessage } from "@myrecipes/api-client/utils/discoverySearchErrorMessage";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DiscoveryState } from "../../types/DiscoveryState";
import { readDiscoveredRecipe } from "./readDiscoveredRecipe";
import { searchDiscoveredRecipes } from "./searchDiscoveredRecipes";

const initialState: DiscoveryState = { generation: 0, search: null, results: null, reads: {}, saved: {} };

const discoverySlice = createSlice({
  name: "discovery",
  initialState,
  reducers: {
    /** `generation` is the one the save started in: a save from an account that has left is dropped. */
    recipeSaved(state, { payload }: PayloadAction<{ resultId: string; recipeId: string; generation: number }>) {
      if (payload.generation === state.generation) state.saved[payload.resultId] = payload.recipeId;
    },
    discoveryCleared(state) {
      return { ...initialState, generation: state.generation + 1 };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchDiscoveredRecipes.pending, (state, { meta }) => {
        state.search = { status: "searching", requestId: meta.requestId, query: meta.arg, startedAt: meta.startedAt };
      })
      .addCase(searchDiscoveredRecipes.fulfilled, (state, { meta, payload }) => {
        if (state.search?.requestId !== meta.requestId) return;
        state.search = { status: "found", requestId: meta.requestId };
        state.results = payload;
      })
      .addCase(searchDiscoveredRecipes.rejected, (state, { meta, payload }) => {
        if (state.search?.requestId !== meta.requestId) return;
        state.search = { status: "failed", requestId: meta.requestId, message: payload ?? discoverySearchErrorMessage(undefined) };
        state.results = null;
      })
      .addCase(readDiscoveredRecipe.pending, (state, { meta }) => {
        state.reads[meta.arg.id] = { status: "reading", requestId: meta.requestId, startedAt: meta.startedAt };
      })
      .addCase(readDiscoveredRecipe.fulfilled, (state, { meta, payload }) => {
        if (isCurrentRead(state, meta.arg.id, meta.requestId)) state.reads[meta.arg.id] = { status: "read", detail: payload };
      })
      .addCase(readDiscoveredRecipe.rejected, (state, { meta, payload }) => {
        if (!isCurrentRead(state, meta.arg.id, meta.requestId)) return;
        state.reads[meta.arg.id] = { status: "failed", message: payload ?? discoveryReadErrorMessage(undefined) };
      });
  },
});

/** Only into the read this request started: not one cleared by signing out, nor a newer one. */
function isCurrentRead(state: DiscoveryState, resultId: string, requestId: string): boolean {
  const read = state.reads[resultId];
  return read?.status === "reading" && read.requestId === requestId;
}

export const { discoveryCleared, recipeSaved } = discoverySlice.actions;
export default discoverySlice.reducer;
