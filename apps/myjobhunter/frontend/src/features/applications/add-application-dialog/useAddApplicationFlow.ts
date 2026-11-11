/**
 * useAddApplicationFlow — state-machine hook for AddApplicationDialog.
 *
 * Owns:
 *   - The discriminated-union DialogState (input → processing → review)
 *   - All step-transition logic (runUrlExtract, runTextParse, resolveCompany)
 *   - Starting the save; the save itself (company fallback, one at a time)
 *     is useApplicationSave's
 *   - The long-running timer that swaps spinner copy at 3 s
 *   - Abandoning a read on close: reset() aborts it and ends the run, so a
 *     read that finishes later neither adds a company nor fills the form
 *
 * Does NOT own:
 *   - The react-hook-form instance (stays in the orchestrator so the form
 *     element + ref hierarchy lives in one place)
 *   - Dialog open/close lifecycle (onOpenChange is passed in so the
 *     orchestrator can reset both the form and this hook together)
 *
 * Pure rules shared with the phone (company matching, pre-fill, the request
 * body, error routing) live in @myjobhunter/api-client; the browser's HTML
 * and URL parsers live in dialogHelpers.ts.
 */
import { useEffect, useRef, useState } from "react";
import { showError, extractErrorMessage } from "@platform/ui";
import { useCompanyResolver } from "@myjobhunter/api-client/hooks/useCompanyResolver";
import { useListCompaniesQuery } from "@myjobhunter/api-client/store/companiesApi";
import {
  useExtractJdFromUrlMutation,
  useParseJobDescriptionMutation,
} from "@myjobhunter/api-client/store/applicationsApi";
import type { JdParseResponse } from "@myjobhunter/api-client/types/application/jd-parse-response";
import type { JdUrlExtractResponse } from "@myjobhunter/api-client/types/application/jd-url-extract-response";
import { JD_READ_LONG_RUNNING_MS } from "@myjobhunter/api-client/constants/addApplicationForm";
import type { AddApplicationFormValues } from "@myjobhunter/api-client/types/application/add-application-form-values";
import type { IsCurrent } from "@myjobhunter/api-client/types/application/company-resolver";
import type { ExtractedCompanyHints } from "@myjobhunter/api-client/types/application/extracted-company-hints";
import type { ReviewCompanyState } from "@myjobhunter/api-client/types/application/review-company-state";
import type { Company } from "@myjobhunter/api-client/types/company";
import { describeExtractError } from "@myjobhunter/api-client/utils/describeExtractError";
import { isAuthRequiredError } from "@myjobhunter/api-client/utils/isAuthRequiredError";
import { jobDescriptionLengthProblem, jobLinkLengthProblem } from "@myjobhunter/api-client/utils/jobSourceProblems";
import { isJobPostingUrl } from "@myjobhunter/api-client/utils/isJobPostingUrl";
import { prefillFromExtract } from "@myjobhunter/api-client/utils/prefillFromExtract";
import { prefillFromParse } from "@myjobhunter/api-client/utils/prefillFromParse";
import {
  INITIAL_STATE,
  type DialogInputMode,
  type DialogState,
} from "../useAddApplicationDialogState";
import { ADD_APPLICATION_MESSAGES as MESSAGES } from "@/constants/add-application-messages";
import { domTextContent, urlHostname } from "./dialogHelpers";
import { useApplicationSave } from "./useApplicationSave";

export interface ApplyPreFillFns {
  /** Called when an extract/parse result arrives. */
  setValue: (
    field: keyof AddApplicationFormValues,
    value: string,
    opts?: { shouldValidate?: boolean },
  ) => void;
}

interface UseAddApplicationFlowReturn {
  state: DialogState;
  urlValue: string;
  textValue: string;
  companyNameValue: string;
  submittedJdText: string;
  /**
   * Persistent "we couldn't read that link" explanation shown on the
   * text tab after a URL fetch was blocked (auth-walled site, 401/403).
   * Replaces the old transient toast, which vanished and left the user
   * on a blank text tab with no idea why — it looked like the app broke.
   * Null when there's nothing to explain.
   */
  urlBlockedNotice: string | null;
  /** Why the link or the pasted description is too long to read (null when it fits). Neither is sent while set. */
  urlProblem: string | null;
  textProblem: string | null;
  companies: Company[];
  creatingApplication: boolean;

  /** Step-1 handlers */
  setInputMode: (mode: DialogInputMode) => void;
  handleUrlInputChange: (next: string) => void;
  handleUrlPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  handleUrlSubmit: () => void;
  handleTextSubmit: () => void;
  handleCompanyNameSelectExisting: (companyId: string, name: string) => void;
  handleCompanyNameCreateOnTheFly: (name: string) => Promise<void>;

  /** Step-3 handlers */
  handlePillChangeRequest: () => void;
  handleReviewSelectExisting: (companyId: string, name: string) => void;
  handleReviewCreateOnTheFly: (name: string) => Promise<void>;
  handleCancelChangingCompany: () => void;
  setCompanyNameValue: (next: string) => void;
  setTextValue: (next: string) => void;

  /** Submit */
  submitApplication: (
    values: AddApplicationFormValues,
    onSuccess: () => void,
  ) => Promise<void>;

  /** Lifecycle */
  reset: () => void;
}

export function useAddApplicationFlow(
  preFillFns: ApplyPreFillFns,
): UseAddApplicationFlowReturn {
  // Starts loading the companies as the dialog mounts; matching waits for them (useCompanyResolver).
  const { data: companiesData } = useListCompaniesQuery();
  const { addCompany, resolveReadCompany, companyIdForSave } = useCompanyResolver(urlHostname);
  const { creatingApplication, save, resetSave } = useApplicationSave(companyIdForSave);
  const [parseJobDescription] = useParseJobDescriptionMutation();
  const [extractJdFromUrl] = useExtractJdFromUrlMutation();

  const [state, setState] = useState<DialogState>(INITIAL_STATE);
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [companyNameValue, setCompanyNameValue] = useState("");
  const [submittedJdText, setSubmittedJdText] = useState<string>("");
  const [urlBlockedNotice, setUrlBlockedNotice] = useState<string | null>(
    null,
  );

  // Bumped by reset() and on unmount, ending every run begun before it, so
  // reopening the dialog never revives an old read. Each read keeps its own
  // check (startRun) rather than a shared "open" flag.
  const runId = useRef(0);
  const inFlightRead = useRef<{ abort: () => void } | null>(null);

  const companies = companiesData?.items ?? [];
  const urlProblem = jobLinkLengthProblem(urlValue) ?? null;
  const textProblem = jobDescriptionLengthProblem(textValue) ?? null;

  useEffect(
    () => () => {
      runId.current += 1;
      inFlightRead.current?.abort();
    },
    [],
  );

  function startRun(): IsCurrent {
    const run = runId.current;
    return () => runId.current === run;
  }

  // -------------------------------------------------------------------------
  // Lifecycle — reset everything, abandoning any read in flight.
  // -------------------------------------------------------------------------
  function reset() {
    runId.current += 1;
    inFlightRead.current?.abort();
    inFlightRead.current = null;
    resetSave();
    setState(INITIAL_STATE);
    setUrlValue("");
    setTextValue("");
    setCompanyNameValue("");
    setSubmittedJdText("");
    setUrlBlockedNotice(null);
  }

  // -------------------------------------------------------------------------
  // Step 1 — input mode switching + paste-and-go.
  // -------------------------------------------------------------------------
  function setInputMode(mode: DialogInputMode) {
    // Returning to the URL field means the blocked-link notice is no
    // longer relevant; keep it while the user is on the text tab.
    if (mode === "url") setUrlBlockedNotice(null);
    setState({ kind: "input", inputMode: mode });
  }

  function handleUrlInputChange(next: string) {
    setUrlValue(next);
  }

  function handleUrlPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").trim();
    // Too long to read: let it land in the field, where the problem is said, rather than send it.
    if (isJobPostingUrl(pasted) && !jobLinkLengthProblem(pasted)) {
      e.preventDefault();
      setUrlValue(pasted);
      void runUrlExtract(pasted);
    }
  }

  function handleUrlSubmit() {
    const url = urlValue.trim();
    if (!url || urlProblem) return;
    void runUrlExtract(url);
  }

  function handleTextSubmit() {
    const text = textValue.trim();
    if (!text || textProblem) return;
    void runTextParse(text);
  }

  function handleCompanyNameSelectExisting(companyId: string, name: string) {
    const company = companies.find((c) => c.id === companyId);
    setState({
      kind: "review",
      sourceUrl: null,
      summary: null,
      company: {
        kind: "manual",
        companyId,
        name,
        logoUrl: company?.logo_url ?? null,
      },
      changingCompany: false,
    });
  }

  async function handleCompanyNameCreateOnTheFly(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const isCurrent = startRun();
    setCompanyNameValue(trimmed);
    try {
      const created = await addCompany({ name: trimmed });
      if (!isCurrent()) return;
      setState({
        kind: "review",
        sourceUrl: null,
        summary: null,
        company: {
          kind: "new",
          companyId: created.id,
          name: created.name,
          logoUrl: created.logo_url,
        },
        changingCompany: false,
      });
    } catch (err) {
      if (!isCurrent()) return;
      showError(`Couldn't create company "${trimmed}": ${extractErrorMessage(err)}`);
      setState({
        kind: "review",
        sourceUrl: null,
        summary: null,
        company: { kind: "autoCreateFailed", name: trimmed },
        changingCompany: false,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Step 2 — processing.
  // -------------------------------------------------------------------------
  async function runUrlExtract(url: string) {
    const isCurrent = startRun();
    setUrlBlockedNotice(null);
    setState({ kind: "processing", sourcePath: "url", longRunning: false });
    const request = extractJdFromUrl({ url });
    inFlightRead.current = request;
    try {
      const result = await request.unwrap();
      if (!isCurrent()) return;
      await applyExtractResult(result, isCurrent);
    } catch (err) {
      if (!isCurrent()) return;
      if (isAuthRequiredError(err)) {
        // Persistent in-context banner on the text tab — NOT a toast.
        // The toast faded and the silent tab-switch read as "broken".
        setInputMode("text");
        setUrlBlockedNotice(
          "We couldn't read that link — it needs a sign-in. Sites like " +
            "LinkedIn and Glassdoor block automated access. Paste the job " +
            "description text below and we'll auto-fill from it.",
        );
        return;
      }
      showError(`Couldn't auto-fill: ${describeExtractError(err)}`);
      setInputMode("url");
    } finally {
      if (inFlightRead.current === request) inFlightRead.current = null;
    }
  }

  async function runTextParse(text: string) {
    const isCurrent = startRun();
    setUrlBlockedNotice(null);
    setState({ kind: "processing", sourcePath: "text", longRunning: false });
    setSubmittedJdText(text);
    const request = parseJobDescription({ jd_text: text });
    inFlightRead.current = request;
    try {
      const result = await request.unwrap();
      if (!isCurrent()) return;
      await applyParseResult(result, isCurrent);
    } catch (err) {
      if (!isCurrent()) return;
      showError(`Couldn't auto-fill: ${extractErrorMessage(err) ?? "AI parsing failed"}`);
      setInputMode("text");
    } finally {
      if (inFlightRead.current === request) inFlightRead.current = null;
    }
  }

  // After 3 s in processing, flip the longRunning flag.
  useEffect(() => {
    if (state.kind !== "processing" || state.longRunning) return;
    const timer = setTimeout(() => {
      setState((prev) => {
        if (prev.kind !== "processing") return prev;
        return { ...prev, longRunning: true };
      });
    }, JD_READ_LONG_RUNNING_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // -------------------------------------------------------------------------
  // Pre-fill helpers — both extract and parse routes converge here.
  // -------------------------------------------------------------------------
  function applyPrefill(prefill: Partial<AddApplicationFormValues>) {
    for (const field of Object.keys(prefill) as (keyof AddApplicationFormValues)[]) {
      const value = prefill[field];
      if (value) preFillFns.setValue(field, value, { shouldValidate: true });
    }
  }

  // The company is matched first, so a read abandoned meanwhile fills nothing.
  async function applyParseResult(result: JdParseResponse, isCurrent: IsCurrent) {
    const company = await resolveCompany(result.company, {}, isCurrent);
    if (!company) return;
    applyPrefill(prefillFromParse(result));
    setState({ kind: "review", sourceUrl: null, summary: result.summary, company, changingCompany: false });
  }

  async function applyExtractResult(result: JdUrlExtractResponse, isCurrent: IsCurrent) {
    const company = await resolveCompany(
      result.company,
      { website: result.company_website, logoUrl: result.company_logo_url },
      isCurrent,
    );
    if (!company) return;
    applyPrefill(prefillFromExtract(result, domTextContent));
    setState({
      kind: "review",
      sourceUrl: result.source_url,
      summary: result.summary,
      company,
      changingCompany: false,
    });
  }

  /** Tracked, added now, or left for saving to retry. Null once the run is stale. */
  async function resolveCompany(
    name: string | null,
    hints: ExtractedCompanyHints,
    isCurrent: IsCurrent,
  ): Promise<ReviewCompanyState | null> {
    const outcome = await resolveReadCompany(name, hints, isCurrent);
    if (outcome.kind === "stale") return null;
    if (outcome.kind === "failed" && outcome.reason === "listUnavailable") {
      showError(MESSAGES.couldntLoadCompanies);
    } else if (outcome.kind === "failed") {
      showError(
        `Couldn't auto-create company "${outcome.company.name}": ${extractErrorMessage(outcome.error)}`,
      );
    }
    return outcome.company;
  }

  // -------------------------------------------------------------------------
  // Step 3 — review. Company pill / combobox transitions.
  // -------------------------------------------------------------------------
  function handlePillChangeRequest() {
    if (state.kind !== "review") return;
    setState({ ...state, changingCompany: true });
    setCompanyNameValue(state.company.name);
  }

  function handleReviewSelectExisting(companyId: string, name: string) {
    if (state.kind !== "review") return;
    const company = companies.find((c) => c.id === companyId);
    setState({
      ...state,
      company: {
        kind: "tracked",
        companyId,
        name,
        logoUrl: company?.logo_url ?? null,
      },
      changingCompany: false,
    });
  }

  async function handleReviewCreateOnTheFly(name: string) {
    if (state.kind !== "review") return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const isCurrent = startRun();
    try {
      const created = await addCompany({ name: trimmed });
      if (!isCurrent()) return;
      setState({
        ...state,
        company: {
          kind: "new",
          companyId: created.id,
          name: created.name,
          logoUrl: created.logo_url,
        },
        changingCompany: false,
      });
    } catch (err) {
      if (!isCurrent()) return;
      showError(`Couldn't create company "${trimmed}": ${extractErrorMessage(err)}`);
      setState({
        ...state,
        company: { kind: "autoCreateFailed", name: trimmed },
        changingCompany: false,
      });
    }
  }

  function handleCancelChangingCompany() {
    if (state.kind !== "review") return;
    setState({ ...state, changingCompany: false });
  }

  // -------------------------------------------------------------------------
  // Submit.
  // -------------------------------------------------------------------------
  async function submitApplication(
    values: AddApplicationFormValues,
    onSuccess: () => void,
  ): Promise<void> {
    if (state.kind !== "review") {
      showError("Finish the auto-fill step first.");
      return;
    }
    const { company, sourceUrl } = state;
    await save({ company, sourceUrl, jdText: submittedJdText, values }, startRun(), onSuccess);
  }

  return {
    state,
    urlValue,
    textValue,
    companyNameValue,
    submittedJdText,
    urlBlockedNotice,
    urlProblem,
    textProblem,
    companies,
    creatingApplication,
    setInputMode,
    handleUrlInputChange,
    handleUrlPaste,
    handleUrlSubmit,
    handleTextSubmit,
    handleCompanyNameSelectExisting,
    handleCompanyNameCreateOnTheFly,
    handlePillChangeRequest,
    handleReviewSelectExisting,
    handleReviewCreateOnTheFly,
    handleCancelChangingCompany,
    setCompanyNameValue,
    setTextValue,
    submitApplication,
    reset,
  };
}
