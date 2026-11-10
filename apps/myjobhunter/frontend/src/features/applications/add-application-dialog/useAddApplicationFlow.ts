/**
 * useAddApplicationFlow — state-machine hook for AddApplicationDialog.
 *
 * Owns:
 *   - The discriminated-union DialogState (input → processing → review)
 *   - All step-transition logic (runUrlExtract, runTextParse, resolveCompany)
 *   - Submit-time company fallback
 *   - The long-running timer that swaps spinner copy at 3 s
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
import { useEffect, useState } from "react";
import { showError, extractErrorMessage } from "@platform/ui";
import {
  useListCompaniesQuery,
  useCreateCompanyMutation,
  useTriggerCompanyResearchMutation,
} from "@myjobhunter/api-client/store/companiesApi";
import {
  useCreateApplicationMutation,
  useExtractJdFromUrlMutation,
  useParseJobDescriptionMutation,
} from "@myjobhunter/api-client/store/applicationsApi";
import type { JdParseResponse } from "@myjobhunter/api-client/types/application/jd-parse-response";
import type { JdUrlExtractResponse } from "@myjobhunter/api-client/types/application/jd-url-extract-response";
import { JD_READ_LONG_RUNNING_MS } from "@myjobhunter/api-client/constants/addApplicationForm";
import type { AddApplicationFormValues } from "@myjobhunter/api-client/types/application/add-application-form-values";
import type { ExtractedCompanyHints } from "@myjobhunter/api-client/types/application/extracted-company-hints";
import type { ReviewCompanyState } from "@myjobhunter/api-client/types/application/review-company-state";
import type { Company } from "@myjobhunter/api-client/types/company";
import { buildApplicationCreateRequest } from "@myjobhunter/api-client/utils/buildApplicationCreateRequest";
import { describeExtractError } from "@myjobhunter/api-client/utils/describeExtractError";
import { findCompanyByName } from "@myjobhunter/api-client/utils/findCompanyByName";
import { isAuthRequiredError } from "@myjobhunter/api-client/utils/isAuthRequiredError";
import { isJobPostingUrl } from "@myjobhunter/api-client/utils/isJobPostingUrl";
import { prefillFromExtract } from "@myjobhunter/api-client/utils/prefillFromExtract";
import { prefillFromParse } from "@myjobhunter/api-client/utils/prefillFromParse";
import { readCompanyId } from "@myjobhunter/api-client/utils/readCompanyId";
import { resolveExtractedCompany } from "@myjobhunter/api-client/utils/resolveExtractedCompany";
import {
  INITIAL_STATE,
  type DialogInputMode,
  type DialogState,
} from "../useAddApplicationDialogState";
import { domTextContent, urlHostname } from "./dialogHelpers";

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
  pendingCompanyName: string | null;
  submittedJdText: string;
  /**
   * Persistent "we couldn't read that link" explanation shown on the
   * text tab after a URL fetch was blocked (auth-walled site, 401/403).
   * Replaces the old transient toast, which vanished and left the user
   * on a blank text tab with no idea why — it looked like the app broke.
   * Null when there's nothing to explain.
   */
  urlBlockedNotice: string | null;
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
  const { data: companiesData } = useListCompaniesQuery();
  const [createApplication, { isLoading: creatingApplication }] =
    useCreateApplicationMutation();
  const [createCompany] = useCreateCompanyMutation();
  const [triggerCompanyResearch] = useTriggerCompanyResearchMutation();
  const [parseJobDescription] = useParseJobDescriptionMutation();
  const [extractJdFromUrl] = useExtractJdFromUrlMutation();

  const [state, setState] = useState<DialogState>(INITIAL_STATE);
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [companyNameValue, setCompanyNameValue] = useState("");
  const [pendingCompanyName, setPendingCompanyName] = useState<string | null>(null);
  const [submittedJdText, setSubmittedJdText] = useState<string>("");
  // Persistent "we couldn't read that link" explanation. Replaces the
  // old transient toast, which vanished and left the user on a blank
  // text tab with no idea why — it looked like the app had broken.
  const [urlBlockedNotice, setUrlBlockedNotice] = useState<string | null>(
    null,
  );

  const companies = companiesData?.items ?? [];

  // -------------------------------------------------------------------------
  // Lifecycle — reset everything.
  // -------------------------------------------------------------------------
  function reset() {
    setState(INITIAL_STATE);
    setUrlValue("");
    setTextValue("");
    setCompanyNameValue("");
    setPendingCompanyName(null);
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
    if (isJobPostingUrl(pasted)) {
      e.preventDefault();
      setUrlValue(pasted);
      void runUrlExtract(pasted);
    }
  }

  function handleUrlSubmit() {
    const url = urlValue.trim();
    if (!url) return;
    void runUrlExtract(url);
  }

  function handleTextSubmit() {
    const text = textValue.trim();
    if (!text) return;
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
    setPendingCompanyName(null);
  }

  async function handleCompanyNameCreateOnTheFly(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCompanyNameValue(trimmed);
    try {
      const created = await createCompany({ name: trimmed }).unwrap();
      void triggerCompanyResearch(created.id)
        .unwrap()
        .catch((err) => {
          console.warn("Background company research failed:", err);
        });
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
      setPendingCompanyName(null);
    } catch (err) {
      showError(`Couldn't create company "${trimmed}": ${extractErrorMessage(err)}`);
      setPendingCompanyName(trimmed);
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
    setUrlBlockedNotice(null);
    setState({ kind: "processing", sourcePath: "url", longRunning: false });
    try {
      const result = await extractJdFromUrl({ url }).unwrap();
      await applyExtractResult(result);
    } catch (err) {
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
    }
  }

  async function runTextParse(text: string) {
    setUrlBlockedNotice(null);
    setState({ kind: "processing", sourcePath: "text", longRunning: false });
    setSubmittedJdText(text);
    try {
      const result = await parseJobDescription({ jd_text: text }).unwrap();
      await applyParseResult(result, { sourceUrl: null });
    } catch (err) {
      showError(`Couldn't auto-fill: ${extractErrorMessage(err) ?? "AI parsing failed"}`);
      setInputMode("text");
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

  async function applyParseResult(
    result: JdParseResponse,
    { sourceUrl }: { sourceUrl: string | null },
  ) {
    applyPrefill(prefillFromParse(result));

    const companyState = await resolveCompany(result.company, {});
    setState({
      kind: "review",
      sourceUrl,
      summary: result.summary,
      company: companyState,
      changingCompany: false,
    });
  }

  async function applyExtractResult(result: JdUrlExtractResponse) {
    applyPrefill(prefillFromExtract(result, domTextContent));

    const companyState = await resolveCompany(result.company, {
      website: result.company_website,
      logoUrl: result.company_logo_url,
    });
    setState({
      kind: "review",
      sourceUrl: result.source_url,
      summary: result.summary,
      company: companyState,
      changingCompany: false,
    });
  }

  async function resolveCompany(
    name: string | null,
    extras: ExtractedCompanyHints,
  ): Promise<ReviewCompanyState> {
    const resolution = resolveExtractedCompany(companies, name, urlHostname, extras);
    if (resolution.kind === "none") {
      setPendingCompanyName(null);
      return { kind: "autoCreateFailed", name: "" };
    }
    if (resolution.kind === "existing") {
      setPendingCompanyName(null);
      const existing = resolution.company;
      return {
        kind: "tracked",
        companyId: existing.id,
        name: existing.name,
        logoUrl: existing.logo_url,
      };
    }
    const trimmed = resolution.request.name;
    setPendingCompanyName(trimmed);

    try {
      const created = await createCompany(resolution.request).unwrap();
      void triggerCompanyResearch(created.id)
        .unwrap()
        .catch((err) => {
          console.warn("Background company research failed:", err);
        });
      setPendingCompanyName(null);
      return {
        kind: "new",
        companyId: created.id,
        name: created.name,
        logoUrl: created.logo_url,
      };
    } catch (err) {
      showError(`Couldn't auto-create company "${trimmed}": ${extractErrorMessage(err)}`);
      return { kind: "autoCreateFailed", name: trimmed };
    }
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
    setPendingCompanyName(null);
  }

  async function handleReviewCreateOnTheFly(name: string) {
    if (state.kind !== "review") return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const created = await createCompany({ name: trimmed }).unwrap();
      void triggerCompanyResearch(created.id)
        .unwrap()
        .catch((err) => {
          console.warn("Background company research failed:", err);
        });
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
      setPendingCompanyName(null);
    } catch (err) {
      showError(`Couldn't create company "${trimmed}": ${extractErrorMessage(err)}`);
      setPendingCompanyName(trimmed);
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
    let companyId = readCompanyId(state.company);

    if (!companyId && pendingCompanyName) {
      try {
        const trimmed = pendingCompanyName.trim();
        const existing = findCompanyByName(companies, trimmed);
        if (existing) {
          companyId = existing.id;
        } else {
          const created = await createCompany({ name: trimmed }).unwrap();
          companyId = created.id;
        }
        setPendingCompanyName(null);
      } catch (err) {
        showError(
          `Couldn't auto-create company "${pendingCompanyName}": ${extractErrorMessage(err)}`,
        );
        return;
      }
    }
    if (!companyId) {
      showError("Pick a company before saving the application.");
      return;
    }

    try {
      await createApplication(
        buildApplicationCreateRequest(values, {
          companyId,
          sourceUrl: state.sourceUrl ?? null,
          jdText: submittedJdText,
        }),
      ).unwrap();
      onSuccess();
    } catch (err) {
      showError(`Couldn't create application: ${extractErrorMessage(err)}`);
    }
  }

  return {
    state,
    urlValue,
    textValue,
    companyNameValue,
    pendingCompanyName,
    submittedJdText,
    urlBlockedNotice,
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
