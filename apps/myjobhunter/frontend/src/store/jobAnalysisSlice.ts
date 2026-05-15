/**
 * Redux slice for the last job-analysis result.
 *
 * Scope: in-app navigation persistence only.
 * The result is stored in Redux so it survives sidebar navigation
 * without requiring a second paid AI call.  A full browser refresh
 * clears the slice (by design — URL-param / backend-refetch is a
 * separate future concern).
 *
 * Actions
 *   setLastAnalysis(result)  — called when an analysis completes
 *   clearLastAnalysis()      — called when the user resets to input
 */
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { JobAnalysis } from "@/types/job-analysis/job-analysis";

interface JobAnalysisState {
  lastResult: JobAnalysis | null;
}

const initialState: JobAnalysisState = {
  lastResult: null,
};

const jobAnalysisSlice = createSlice({
  name: "jobAnalysis",
  initialState,
  reducers: {
    setLastAnalysis(state, action: PayloadAction<JobAnalysis>) {
      state.lastResult = action.payload;
    },
    clearLastAnalysis(state) {
      state.lastResult = null;
    },
  },
});

export const { setLastAnalysis, clearLastAnalysis } =
  jobAnalysisSlice.actions;

export default jobAnalysisSlice.reducer;
