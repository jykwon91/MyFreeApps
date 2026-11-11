import { useIsLongRunning } from "@myjobhunter/api-client/hooks/useIsLongRunning";
import { useAnalyzeJobMutation, useApplyFromAnalysisMutation } from "@myjobhunter/api-client/store/jobAnalysisApi";
import {
  analysisCancelled,
  analysisFailed,
  analysisFailureDismissed,
  analysisStarted,
  clearLastAnalysis,
  markLastAnalysisApplied,
  setLastAnalysis,
} from "@myjobhunter/api-client/store/jobAnalysisSlice";
import type { JobAnalysisRequest } from "@myjobhunter/api-client/types/job-analysis/job-analysis-request";
import type { JobAnalysisSource } from "@myjobhunter/api-client/types/job-analysis/job-analysis-source";
import { analysisFailureFrom } from "@myjobhunter/api-client/utils/analysisFailureFrom";
import { isJobPostingUrl } from "@myjobhunter/api-client/utils/isJobPostingUrl";
import { jobDescriptionLengthProblem, jobLinkLengthProblem } from "@myjobhunter/api-client/utils/jobSourceProblems";
import { useToast } from "@platform/mobile";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector, useStore } from "react-redux";
import { ANALYZE_MESSAGES as MESSAGES } from "../../constants/analyze";
import type { AppDispatch, RootState } from "../../lib/store";
import { useAnnounceNewVerdict } from "./useAnnounceNewVerdict";

/**
 * The website's /analyze page: read a link or pasted text, wait while the AI scores it, then show
 * the verdict, from which it can be added to applications. The result is kept in the store, as on
 * the website, so leaving and coming back shows it again without paying for another analysis.
 *
 * The running analysis is in the store too, not in this screen: one left running when the screen
 * goes still lands there, and the screen opened again shows its wait, with Cancel. So does why it
 * failed, so a sign-in-walled link still moves to the text tab on the screen opened since. Only the
 * pending request's answer is kept, so an older one, a cancelled one, or one from before the account
 * changed is ignored when it comes.
 */
export function useAnalyzeFlow() {
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();
  const { showToast } = useToast();
  const result = useSelector((state: RootState) => state.jobAnalysis.lastResult);
  const pending = useSelector((state: RootState) => state.jobAnalysis.pending);
  const storedFailure = useSelector((state: RootState) => state.jobAnalysis.failure);
  const [analyzeJob] = useAnalyzeJobMutation();
  const [applyFromAnalysis] = useApplyFromAnalysisMutation();

  const [chosenSource, setSourceState] = useState<JobAnalysisSource>("url");
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  // A problem found on the phone before anything was sent, such as a link that isn't one.
  const [inputProblem, setInputProblem] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const isMounted = useRef(true);
  // The request this screen sent, so Cancel can abort it. One sent before the screen was opened
  // again isn't here; cancelling that one only stops waiting for it.
  const inFlight = useRef<{ abort: () => void } | null>(null);

  // What is being analyzed while the AI works on it; null otherwise.
  const analyzing = pending?.source ?? null;
  const isLongRunning = useIsLongRunning(pending?.startedAt ?? null);
  useAnnounceNewVerdict(pending, result);

  // A sign-in-walled link is pasted as text instead, saying why until the link tab is chosen again.
  const isBlocked = storedFailure?.authRequired === true;
  const source = isBlocked ? "text" : chosenSource;
  const failure = inputProblem ?? (storedFailure && !isBlocked ? `${MESSAGES.couldntAnalyze} ${storedFailure.message}` : null);
  const blockedNotice = isBlocked ? MESSAGES.linkBlocked : null;

  const textError = jobDescriptionLengthProblem(textValue) ?? null;
  const shownResult = analyzing === null ? result : null;
  const hasTypedInput = urlValue.trim() !== "" || textValue.trim() !== "";

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      // Why it failed has been shown here; coming back starts afresh.
      dispatch(analysisFailureDismissed());
    };
  }, [dispatch]);

  function setSource(next: JobAnalysisSource): void {
    // The sign-in notice explains the text tab, so it stays there; any other failure is done with.
    if (storedFailure && !(isBlocked && next === "text")) dispatch(analysisFailureDismissed());
    setInputProblem(null);
    setSourceState(next);
  }

  async function analyze(kind: JobAnalysisSource, body: JobAnalysisRequest): Promise<void> {
    // The store, not this render, says whether one is running: Paste reads the clipboard first, and
    // Analyze pressed meanwhile has started one this render doesn't know of. Each would be paid for.
    if (store.getState().jobAnalysis.pending) return;
    setInputProblem(null);
    const request = analyzeJob(body);
    const { requestId } = request;
    dispatch(analysisStarted({ requestId, source: kind, startedAt: Date.now() }));
    inFlight.current = request;
    try {
      // Kept only if still the one waited for, even once the screen has gone, as on the website.
      dispatch(setLastAnalysis({ requestId, analysis: await request.unwrap() }));
    } catch (error) {
      // Kept only if still the one waited for; whichever Analyze screen is open shows it.
      dispatch(analysisFailed({ requestId, failure: analysisFailureFrom(error, kind) }));
    } finally {
      if (inFlight.current === request) inFlight.current = null;
    }
  }

  async function analyzeLink(link: string = urlValue): Promise<void> {
    const url = link.trim();
    if (!url || analyzing) return;
    const problem = isJobPostingUrl(url) ? jobLinkLengthProblem(url) : MESSAGES.notALink;
    if (problem) {
      setInputProblem(problem);
      return;
    }
    setUrlValue(url);
    await analyze("url", { url });
  }

  /** Analyzes the link on the clipboard straight away, as pasting one does on the website. */
  async function pasteLink(): Promise<void> {
    if (analyzing) return;
    let pasted: string;
    try {
      pasted = (await Clipboard.getStringAsync()).trim();
    } catch {
      if (isMounted.current) setInputProblem(MESSAGES.couldntReadClipboard);
      return;
    }
    if (!isMounted.current) return;
    if (!pasted) {
      setInputProblem(MESSAGES.noLinkOnClipboard);
      return;
    }
    await analyzeLink(pasted);
  }

  async function analyzeText(): Promise<void> {
    const text = textValue.trim();
    if (!text || analyzing || textError) return;
    // The text tab may be showing only for a sign-in-walled link; it stays once that's cleared.
    setSourceState("text");
    await analyze("text", { jd_text: text });
  }

  /** Stops waiting and goes back to what was entered. The server may still finish it; its answer is ignored. */
  function cancel(): void {
    dispatch(analysisCancelled());
    inFlight.current?.abort();
    inFlight.current = null;
  }

  function analyzeAnother(): void {
    setUrlValue("");
    setTextValue("");
    setInputProblem(null);
    setSourceState("url");
    dispatch(clearLastAnalysis());
  }

  function viewApplications(): void {
    router.dismissTo("/applications");
  }

  /** Adding's failures are toasted, as on the website, where the button that was pressed is. */
  async function addToApplications(): Promise<void> {
    if (!shownResult || isApplying) return;
    const analysisId = shownResult.id;
    setIsApplying(true);
    try {
      const application = await applyFromAnalysis(analysisId).unwrap();
      dispatch(markLastAnalysisApplied({ analysisId, applicationId: application.id }));
      showToast(MESSAGES.added);
      if (isMounted.current) viewApplications();
    } catch {
      showToast(MESSAGES.couldntAdd, "error");
    } finally {
      if (isMounted.current) setIsApplying(false);
    }
  }

  return {
    source,
    setSource,
    urlValue,
    setUrlValue,
    textValue,
    setTextValue,
    textError,
    analyzing,
    isLongRunning,
    blockedNotice,
    failure,
    result: shownResult,
    isApplying,
    // Typed input not yet analyzed is lost on leaving; a running analysis carries on, and a result is kept.
    hasUnsavedInput: analyzing === null && shownResult === null && hasTypedInput,
    analyzeLink,
    pasteLink,
    analyzeText,
    cancel,
    analyzeAnother,
    addToApplications,
    viewApplications,
  };
}
