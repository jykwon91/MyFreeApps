import { discoveryReadErrorMessage } from "../utils/discoveryReadErrorMessage";
import { discoverySearchErrorMessage } from "../utils/discoverySearchErrorMessage";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DiscoveryRead } from "../types/recipe/discovery-read";
import type { DiscoverySearch } from "../types/recipe/discovery-search";
import type { DiscoveryState } from "../types/recipe/discovery-state";
import type { DiscoveryStoreState } from "../types/recipe/discovery-store-state";
import type { DiscoveryResults } from "../types/recipe/discovery";
import { recipeForgotten } from "./recipeForgotten";
import { readDiscoveredRecipe } from "./readDiscoveredRecipe";
import { searchDiscoveredRecipes } from "./searchDiscoveredRecipes";

/**
 * Discover's search, reads and saves, for the website and the phone. Each search and read is a
 * paid Claude call, so they live in the store, not a screen: leaving Discover and coming back keeps
 * them, until the account leaves (`discoveryCleared`) or the app is reloaded.
 */
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
      .addCase(recipeForgotten, (state, { payload }) => {
        for (const [resultId, recipeId] of Object.entries(state.saved)) {
          if (recipeId === payload) delete state.saved[resultId];
        }
      })
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

export const selectDiscoverySearch = (state: DiscoveryStoreState): DiscoverySearch | null => state.discovery.search;
export const selectDiscoveryResults = (state: DiscoveryStoreState): DiscoveryResults | null => state.discovery.results;
export const selectDiscoveryGeneration = (state: DiscoveryStoreState): number => state.discovery.generation;
export const selectDiscoveryRead = (state: DiscoveryStoreState, resultId: string): DiscoveryRead | undefined =>
  state.discovery.reads[resultId];
/** The recipe this result was saved as, if it has been. */
export const selectSavedRecipeId = (state: DiscoveryStoreState, resultId: string): string | undefined =>
  state.discovery.saved[resultId];
/** Whether a search or any read is still waiting on its answer. */
export const selectDiscoveryIsBusy = (state: DiscoveryStoreState): boolean =>
  state.discovery.search?.status === "searching" ||
  Object.values(state.discovery.reads).some((read) => read.status === "reading");

export const { discoveryCleared, recipeSaved } = discoverySlice.actions;
export default discoverySlice.reducer;
