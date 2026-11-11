import { analysisStarted, setLastAnalysis } from "@myjobhunter/api-client/store/jobAnalysisSlice";
import type { JobAnalysis } from "@myjobhunter/api-client/types/job-analysis/job-analysis";
import { store } from "../src/lib/store";

/** Puts `analysis` in the store as the last result, as one that came back earlier would be. */
export function rememberAnalysis(analysis: JobAnalysis): void {
  const requestId = `remembered-${analysis.id}`;
  store.dispatch(analysisStarted({ requestId, source: "url", startedAt: Date.now() }));
  store.dispatch(setLastAnalysis({ requestId, analysis }));
}
