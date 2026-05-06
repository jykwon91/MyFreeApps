/**
 * Analyze-a-job page (/analyze).
 *
 * Three-state flow, modeled as a discriminated union (NOT useEffect-driven):
 *
 *   1. INPUT       — operator pastes URL or text
 *   2. PROCESSING  — analyzing… spinner; flips to "longer than usual" copy
 *                    after 3s
 *   3. RESULT      — verdict banner + dimensions table + decision row
 *
 * The state machine is local — there's no backend session for an
 * in-flight analysis. If the operator refreshes mid-analysis they
 * lose progress (the analysis itself either persisted or didn't,
 * depending on whether Claude returned). This is the same shape the
 * Add Application dialog uses for its three-step flow.
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
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import { EmptyState, showError, showSuccess, extractErrorMessage } from "@platform/ui";
import AnalyzeJdInput, {
  type AnalyzeInputMode,
} from "@/features/analyze/AnalyzeJdInput";
import JobAnalysisHeader from "@/features/analyze/JobAnalysisHeader";
import VerdictBanner from "@/features/analyze/VerdictBanner";
import DimensionsTable from "@/features/analyze/DimensionsTable";
import AnalysisActions from "@/features/analyze/AnalysisActions";
import {
  describeExtractError,
  isAuthRequiredError,
} from "@/features/applications/jdErrorRouting";
import {
  useAnalyzeJobMutation,
  useApplyFromAnalysisMutation,
} from "@/lib/jobAnalysisApi";
import type { JobAnalysis } from "@/types/job-analysis/job-analysis";

const PROCESSING_LONG_RUNNING_THRESHOLD_MS = 3000;

type PageState =
  | { kind: "input"; mode: AnalyzeInputMode }
  | { kind: "processing"; sourcePath: "url" | "text"; longRunning: boolean }
  | { kind: "result"; analysis: JobAnalysis };

const INITIAL_STATE: PageState = { kind: "input", mode: "url" };

export default function Analyze() {
  const navigate = useNavigate();
  const [analyzeJob, { isLoading: analyzing }] = useAnalyzeJobMutation();
  const [applyFromAnalysis, { isLoading: applying }] =
    useApplyFromAnalysisMutation();

  const [state, setState] = useState<PageState>(INITIAL_STATE);
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");

  // ---------------------------------------------------------------------
  // Step transitions
  // ---------------------------------------------------------------------

  function setInputMode(mode: AnalyzeInputMode) {
    setState({ kind: "input", mode });
  }

  function resetToInput(mode: AnalyzeInputMode = "url") {
    setUrlValue("");
    setTextValue("");
    setState({ kind: "input", mode });
  }

  async function runAnalyzeUrl(url: string) {
    const trimmed = url.trim();
    if (!trimmed) return;
    setState({ kind: "processing", sourcePath: "url", longRunning: false });
    try {
      const result = await analyzeJob({ url: trimmed }).unwrap();
      setState({ kind: "result", analysis: result });
    } catch (err) {
      if (isAuthRequiredError(err)) {
        showError(
          "That page requires sign-in or blocked our request. Paste the description text instead.",
        );
        setInputMode("text");
        return;
      }
      showError(`Couldn't analyze: ${describeExtractError(err)}`);
      setInputMode("url");
    }
  }

  async function runAnalyzeText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setState({ kind: "processing", sourcePath: "text", longRunning: false });
    try {
      const result = await analyzeJob({ jd_text: trimmed }).unwrap();
      setState({ kind: "result", analysis: result });
    } catch (err) {
      showError(
        `Couldn't analyze: ${extractErrorMessage(err) ?? "AI analysis failed"}`,
      );
      setInputMode("text");
    }
  }

  function handlePasteUrl(pasted: string) {
    setUrlValue(pasted);
    void runAnalyzeUrl(pasted);
  }

  async function handleAddToApplications() {
    if (state.kind !== "result") return;
    try {
      await applyFromAnalysis(state.analysis.id).unwrap();
      showSuccess("Application added");
      navigate("/applications");
    } catch (err) {
      showError(`Couldn't save: ${extractErrorMessage(err)}`);
    }
  }

  // ---------------------------------------------------------------------
  // "Longer than usual…" copy after 3 seconds in processing.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (state.kind !== "processing" || state.longRunning) return;
    const timer = setTimeout(() => {
      setState((prev) => {
        if (prev.kind !== "processing") return prev;
        return { ...prev, longRunning: true };
      });
    }, PROCESSING_LONG_RUNNING_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <main className="p-4 sm:p-8 space-y-6">
      {state.kind === "input" ? (
        <InputView
          mode={state.mode}
          urlValue={urlValue}
          textValue={textValue}
          analyzing={analyzing}
          onChangeMode={setInputMode}
          onChangeUrl={setUrlValue}
          onChangeText={setTextValue}
          onSubmitUrl={() => runAnalyzeUrl(urlValue)}
          onSubmitText={() => runAnalyzeText(textValue)}
          onPasteUrl={handlePasteUrl}
        />
      ) : null}

      {state.kind === "processing" ? (
        <ProcessingView
          sourcePath={state.sourcePath}
          longRunning={state.longRunning}
        />
      ) : null}

      {state.kind === "result" ? (
        <ResultView
          analysis={state.analysis}
          applying={applying}
          onApply={handleAddToApplications}
          onAnalyzeAnother={() => resetToInput("url")}
          onViewApplications={() => navigate("/applications")}
        />
      ) : null}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Input view
// ---------------------------------------------------------------------------

interface InputViewProps {
  mode: AnalyzeInputMode;
  urlValue: string;
  textValue: string;
  analyzing: boolean;
  onChangeMode: (mode: AnalyzeInputMode) => void;
  onChangeUrl: (next: string) => void;
  onChangeText: (next: string) => void;
  onSubmitUrl: () => void;
  onSubmitText: () => void;
  onPasteUrl: (pasted: string) => void;
}

function InputView(props: InputViewProps) {
  return (
    <>
      <header className="space-y-1 max-w-2xl">
        <h1 className="text-2xl font-semibold">Analyze a job</h1>
        <p className="text-sm text-muted-foreground">
          Paste a job description to see how it stacks up against your
          profile. We'll rank fit across skills, seniority, salary,
          location, and work authorization — then you can decide whether
          to add it to your applications.
        </p>
      </header>
      <div className="max-w-2xl rounded-lg border bg-card p-4 sm:p-6">
        <AnalyzeJdInput {...props} isSubmitting={props.analyzing} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Processing view
// ---------------------------------------------------------------------------

interface ProcessingViewProps {
  sourcePath: "url" | "text";
  longRunning: boolean;
}

function ProcessingView({ sourcePath, longRunning }: ProcessingViewProps) {
  const primary =
    sourcePath === "url"
      ? "Reading the posting and analyzing fit…"
      : "Analyzing this role…";
  const longCopy = "This is taking longer than usual…";
  return (
    <div className="max-w-2xl">
      <EmptyState
        icon={
          <Loader2
            size={36}
            className="animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        }
        heading={longRunning ? longCopy : primary}
        body={
          longRunning
            ? "Long postings can take 10–20 seconds to score."
            : "Usually takes 5–15 seconds."
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result view
// ---------------------------------------------------------------------------

interface ResultViewProps {
  analysis: JobAnalysis;
  applying: boolean;
  onApply: () => void;
  onAnalyzeAnother: () => void;
  onViewApplications: () => void;
}

function ResultView({
  analysis,
  applying,
  onApply,
  onAnalyzeAnother,
  onViewApplications,
}: ResultViewProps) {
  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles size={14} aria-hidden="true" />
        <span>Analyzed against your profile</span>
      </div>

      <JobAnalysisHeader
        extracted={analysis.extracted}
        sourceUrl={analysis.source_url}
      />
      <VerdictBanner
        verdict={analysis.verdict}
        summary={analysis.verdict_summary}
      />
      <DimensionsTable
        dimensions={analysis.dimensions}
        redFlags={analysis.red_flags}
        greenFlags={analysis.green_flags}
      />
      <AnalysisActions
        appliedApplicationId={analysis.applied_application_id}
        applying={applying}
        onApply={onApply}
        onAnalyzeAnother={onAnalyzeAnother}
        onViewApplications={onViewApplications}
      />
    </div>
  );
}
