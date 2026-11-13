/**
 * Analyze-a-job page (/analyze).
 *
 * Three views, derived from the jobAnalysis slice (NOT useEffect-driven):
 *
 *   1. INPUT       — operator pastes URL or text
 *   2. PROCESSING  — an analysis is pending; spinner, flipping to "longer
 *                    than usual" copy after 3s from when it was sent
 *   3. RESULT      — verdict banner + dimensions table + decision row
 *
 * There's no backend session for an in-flight analysis. If the operator
 * refreshes mid-analysis they lose progress (the analysis itself either
 * persisted or didn't, depending on whether Claude returned).
 *
 * Redux-slice persistence (in-app navigation only):
 * The pending request, the last result, and why the last one failed live in
 * the jobAnalysis slice, so navigating away and back shows the wait, the
 * result, or the sign-in-walled link's notice again — no second paid AI
 * call, and no flash of the input view. Only the pending request's answer is
 * kept: "Analyze another", a newer analysis, and a sign-in or sign-out (which
 * reset the API cache, and the slice with it) all make an older answer
 * arriving later a no-op. Adding to applications says nothing once the
 * account has changed (its result is gone from the slice).
 *
 * Operator workflow (verbatim from session notes):
 * > "the application page should not be the first step. when we paste
 *    a jd, it should be analysis. applying to the job should be the
 *    next step if analysis passes inspection"
 * > "it should be a separate page that ranks the job in terms of fit
 *    with resume, work culture preference, remote/hybrid/onsite, etc.
 *    from there, the user can decide to move towards the application
 *    phase"
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector, useStore } from "react-redux";
import { showError, showSuccess, extractErrorMessage } from "@platform/ui";
import type { AnalyzeInputMode } from "@/features/analyze/AnalyzeJdInput";
import AnalyzeInputView from "@/features/analyze/AnalyzeInputView";
import AnalyzeProcessingView from "@/features/analyze/AnalyzeProcessingView";
import AnalyzeResultView from "@/features/analyze/AnalyzeResultView";
import { ANALYZE_MESSAGES } from "@/constants/analyze-messages";
import { useIsLongRunning } from "@myjobhunter/api-client/hooks/useIsLongRunning";
import { analysisFailureFrom } from "@myjobhunter/api-client/utils/analysisFailureFrom";
import {
  useAnalyzeJobMutation,
  useApplyFromAnalysisMutation,
} from "@myjobhunter/api-client/store/jobAnalysisApi";
import {
  analysisFailed,
  analysisFailureDismissed,
  analysisStarted,
  clearLastAnalysis,
  isPendingAnalysis,
  markLastAnalysisApplied,
  setLastAnalysis,
} from "@myjobhunter/api-client/store/jobAnalysisSlice";
import type { RootState } from "@/lib/store";
import type { JobAnalysis } from "@myjobhunter/api-client/types/job-analysis/job-analysis";
import type { JobAnalysisRequest } from "@myjobhunter/api-client/types/job-analysis/job-analysis-request";
import type { JobAnalysisSource } from "@myjobhunter/api-client/types/job-analysis/job-analysis-source";

export default function Analyze() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const store = useStore<RootState>();
  const lastResult = useSelector((s: RootState) => s.jobAnalysis.lastResult);
  const pending = useSelector((s: RootState) => s.jobAnalysis.pending);
  const failure = useSelector((s: RootState) => s.jobAnalysis.failure);
  const longRunning = useIsLongRunning(pending?.startedAt ?? null);

  const [analyzeJob] = useAnalyzeJobMutation();
  const [applyFromAnalysis, { isLoading: applying }] =
    useApplyFromAnalysisMutation();

  const [chosenMode, setMode] = useState<AnalyzeInputMode>("url");
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");

  // A sign-in-walled link moves to the text tab with a persistent
  // explanation (not a toast, which vanished and left the user on a blank
  // text tab with no idea why). It's kept in the slice, so it's still there
  // on coming back, until the URL tab is chosen again.
  const linkBlocked = failure?.authRequired === true;
  const mode: AnalyzeInputMode = linkBlocked ? "text" : chosenMode;

  // ---------------------------------------------------------------------
  // Step transitions
  // ---------------------------------------------------------------------

  function setInputMode(next: AnalyzeInputMode) {
    if (next === "url" && linkBlocked) dispatch(analysisFailureDismissed());
    setMode(next);
  }

  function resetToInput(next: AnalyzeInputMode = "url") {
    setUrlValue("");
    setTextValue("");
    dispatch(clearLastAnalysis());
    setMode(next);
  }

  async function runAnalyze(source: JobAnalysisSource, body: JobAnalysisRequest) {
    const request = analyzeJob(body);
    const { requestId } = request;
    dispatch(analysisStarted({ requestId, source, startedAt: Date.now() }));
    setMode(source);
    try {
      // Kept only if it's still the analysis being waited for.
      dispatch(setLastAnalysis({ requestId, analysis: await request.unwrap() }));
    } catch (err) {
      // Superseded, cleared, or from before a sign-in or sign-out: not ours to report.
      if (!isPendingAnalysis(store.getState().jobAnalysis, requestId)) return;
      const analysisFailure = analysisFailureFrom(err, source);
      dispatch(analysisFailed({ requestId, failure: analysisFailure }));
      if (analysisFailure.authRequired) return;
      // Any other failure is toasted, so it's said even on another page, and done with.
      showError(`${ANALYZE_MESSAGES.couldntAnalyze} ${analysisFailure.message}`);
      dispatch(analysisFailureDismissed());
    }
  }

  function runAnalyzeUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    void runAnalyze("url", { url: trimmed });
  }

  function runAnalyzeText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    void runAnalyze("text", { jd_text: trimmed });
  }

  function handlePasteUrl(pasted: string) {
    setUrlValue(pasted);
    runAnalyzeUrl(pasted);
  }

  async function handleAddToApplications(analysis: JobAnalysis) {
    // A sign-in or sign-out meanwhile clears the result: nothing is said to the next account.
    const stillThisAccount = () => store.getState().jobAnalysis.lastResult?.id === analysis.id;
    try {
      const application = await applyFromAnalysis(analysis.id).unwrap();
      if (!stillThisAccount()) return;
      // Coming back to this page shows it as saved, not as one to add again.
      dispatch(
        markLastAnalysisApplied({
          analysisId: analysis.id,
          applicationId: application.id,
        }),
      );
      showSuccess(ANALYZE_MESSAGES.added);
      navigate("/applications");
    } catch (err) {
      if (stillThisAccount()) showError(`${ANALYZE_MESSAGES.couldntSave} ${extractErrorMessage(err)}`);
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="p-4 sm:p-8 space-y-6">
      {pending ? (
        <AnalyzeProcessingView sourcePath={pending.source} longRunning={longRunning} />
      ) : lastResult ? (
        <AnalyzeResultView
          analysis={lastResult}
          applying={applying}
          onApply={() => handleAddToApplications(lastResult)}
          onAnalyzeAnother={() => resetToInput("url")}
          onViewApplications={() => navigate("/applications")}
        />
      ) : (
        <AnalyzeInputView
          mode={mode}
          urlValue={urlValue}
          textValue={textValue}
          notice={linkBlocked ? ANALYZE_MESSAGES.linkBlocked : null}
          onChangeMode={setInputMode}
          onChangeUrl={setUrlValue}
          onChangeText={setTextValue}
          onSubmitUrl={() => runAnalyzeUrl(urlValue)}
          onSubmitText={() => runAnalyzeText(textValue)}
          onPasteUrl={handlePasteUrl}
        />
      )}
    </div>
  );
}
