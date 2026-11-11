/**
 * Redux slice for the job analysis: the one running and the last result.
 *
 * Scope: in-app navigation persistence only.
 * The result is stored in Redux so it survives navigation without requiring a
 * second paid AI call, and the running analysis is stored so a page opened
 * mid-wait shows it. A full browser refresh clears the slice (by design).
 *
 * Only the answer to the pending request is kept. Starting another, cancelling,
 * clearing and an account change all replace or drop the pending request, so an
 * older answer arriving later is ignored instead of overwriting a newer one or
 * landing in the next account.
 *
 * A failure is kept the same way, as plain data, so whichever Analyze screen is
 * open when it lands (or opens next) can say why, such as moving a sign-in-walled
 * link to the text tab.
 *
 * Actions
 *   analysisStarted(pending)        — an analysis was sent
 *   setLastAnalysis({requestId, analysis})
 *                                   — it came back; kept only if still pending
 *   analysisFailed({requestId, failure})
 *                                   — it failed; kept only if still pending
 *   analysisFailureDismissed()      — the failure has been shown and dealt with
 *   analysisCancelled()             — the user stopped waiting
 *   clearLastAnalysis()             — the user reset to input
 *   markLastAnalysisApplied({analysisId, applicationId})
 *                                   — added to applications, so coming back
 *                                     shows it as saved
 *
 * The API cache's reset (`baseApi.util.resetApiState`), which every sign-in and
 * explicit sign-out dispatches, empties this slice too: both belong to one
 * account.
 */
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { baseApi } from "@platform/core/store/baseApi";
import type { AppliedAnalysis } from "../types/job-analysis/applied-analysis";
import type { FailedAnalysis } from "../types/job-analysis/failed-analysis";
import type { FinishedAnalysis } from "../types/job-analysis/finished-analysis";
import type { JobAnalysisState } from "../types/job-analysis/job-analysis-state";
import type { PendingAnalysis } from "../types/job-analysis/pending-analysis";

const initialState: JobAnalysisState = {
  lastResult: null,
  pending: null,
  failure: null,
};

/** Whether `requestId` is the analysis still being waited for. */
export function isPendingAnalysis(state: JobAnalysisState, requestId: string): boolean {
  return state.pending?.requestId === requestId;
}

const jobAnalysisSlice = createSlice({
  name: "jobAnalysis",
  initialState,
  reducers: {
    analysisStarted(state, action: PayloadAction<PendingAnalysis>) {
      state.pending = action.payload;
      state.lastResult = null;
      state.failure = null;
    },
    setLastAnalysis(state, action: PayloadAction<FinishedAnalysis>) {
      if (!isPendingAnalysis(state, action.payload.requestId)) return;
      state.pending = null;
      state.lastResult = action.payload.analysis;
    },
    analysisFailed(state, action: PayloadAction<FailedAnalysis>) {
      if (!isPendingAnalysis(state, action.payload.requestId)) return;
      state.pending = null;
      state.failure = action.payload.failure;
    },
    analysisFailureDismissed(state) {
      state.failure = null;
    },
    analysisCancelled(state) {
      state.pending = null;
      state.failure = null;
    },
    clearLastAnalysis(state) {
      state.lastResult = null;
      state.pending = null;
      state.failure = null;
    },
    markLastAnalysisApplied(state, action: PayloadAction<AppliedAnalysis>) {
      // A different analysis may have finished since; only the one added is marked.
      if (state.lastResult?.id === action.payload.analysisId) {
        state.lastResult.applied_application_id = action.payload.applicationId;
      }
    },
  },
  extraReducers: (builder) => {
    builder.addMatcher(baseApi.util.resetApiState.match, () => initialState);
  },
});

export const {
  analysisStarted,
  setLastAnalysis,
  analysisFailed,
  analysisFailureDismissed,
  analysisCancelled,
  clearLastAnalysis,
  markLastAnalysisApplied,
} = jobAnalysisSlice.actions;

export default jobAnalysisSlice.reducer;
