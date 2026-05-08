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
 * Pure utility functions (combineNotes, stripHtml, etc.) live in
 * dialogHelpers.ts to keep this file focused on state transitions.
 */
import { useEffect, useState } from "react";
import { showError, extractErrorMessage } from "@platform/ui";
import {
  useListCompaniesQuery,
  useCreateCompanyMutation,
  useTriggerCompanyResearchMutation,
} from "@/lib/companiesApi";
import {
  useCreateApplicationMutation,
  useExtractJdFromUrlMutation,
  useParseJobDescriptionMutation,
} from "@/lib/applicationsApi";
import type { JdParseResponse } from "@/types/application/jd-parse-response";
import type { JdUrlExtractResponse } from "@/types/application/jd-url-extract-response";
import { describeExtractError, isAuthRequiredError } from "../jdErrorRouting";
import {
  INITIAL_STATE,
  PROCESSING_LONG_RUNNING_THRESHOLD_MS,
  type DialogInputMode,
  type DialogState,
  type ReviewCompanyState,
} from "../useAddApplicationDialogState";
import type { Company } from "@/types/company";
import {
  findCompanyByName,
  readCompanyId,
  websiteToDomain,
  combineNotes,
} from "./dialogHelpers";

const URL_REGEX = /^https?:\/\/\S+$/i;

export interface AddApplicationFormValues {
  role_title: string;
  location: string;
  remote_type: "unknown" | "remote" | "hybrid" | "onsite";
  notes: string;
}

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
  }

  // -------------------------------------------------------------------------
  // Step 1 — input mode switching + paste-and-go.
  // -------------------------------------------------------------------------
  function setInputMode(mode: DialogInputMode) {
    setState({ kind: "input", inputMode: mode });
  }

  function handleUrlInputChange(next: string) {
    setUrlValue(next);
  }

  function handleUrlPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").trim();
    if (URL_REGEX.test(pasted)) {
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
    setState({ kind: "processing", sourcePath: "url", longRunning: false });
    try {
      const result = await extractJdFromUrl({ url }).unwrap();
      await applyExtractResult(result);
    } catch (err) {
      if (isAuthRequiredError(err)) {
        showError(
          "That page requires sign-in or blocked our request. Paste the description text instead.",
        );
        setInputMode("text");
        return;
      }
      showError(`Couldn't auto-fill: ${describeExtractError(err)}`);
      setInputMode("url");
    }
  }

  async function runTextParse(text: string) {
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
    }, PROCESSING_LONG_RUNNING_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // -------------------------------------------------------------------------
  // Pre-fill helpers — both extract and parse routes converge here.
  // -------------------------------------------------------------------------
  async function applyParseResult(
    result: JdParseResponse,
    { sourceUrl }: { sourceUrl: string | null },
  ) {
    const { setValue } = preFillFns;
    if (result.title) setValue("role_title", result.title, { shouldValidate: true });
    if (result.location) setValue("location", result.location, { shouldValidate: true });
    if (
      result.remote_type === "remote" ||
      result.remote_type === "hybrid" ||
      result.remote_type === "onsite"
    ) {
      setValue("remote_type", result.remote_type, { shouldValidate: true });
    }

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
    const { setValue } = preFillFns;
    if (result.title) setValue("role_title", result.title, { shouldValidate: true });
    if (result.location) setValue("location", result.location, { shouldValidate: true });

    const notesScaffold = combineNotes(result);
    if (notesScaffold) {
      setValue("notes", notesScaffold, { shouldValidate: true });
    }

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

  interface CompanyExtras {
    website?: string | null;
    logoUrl?: string | null;
  }

  async function resolveCompany(
    name: string | null,
    extras: CompanyExtras,
  ): Promise<ReviewCompanyState> {
    const trimmed = (name ?? "").trim();
    if (!trimmed) {
      setPendingCompanyName(null);
      return { kind: "autoCreateFailed", name: "" };
    }
    setPendingCompanyName(trimmed);

    const existing = findCompanyByName(companies, trimmed);
    if (existing) {
      setPendingCompanyName(null);
      return {
        kind: "tracked",
        companyId: existing.id,
        name: existing.name,
        logoUrl: existing.logo_url,
      };
    }

    try {
      const payload: { name: string; primary_domain?: string | null; logo_url?: string | null } =
        { name: trimmed };
      const domain = websiteToDomain(extras.website);
      if (domain) payload.primary_domain = domain;
      if (extras.logoUrl) payload.logo_url = extras.logoUrl;

      const created = await createCompany(payload).unwrap();
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
      const url = state.sourceUrl ?? null;
      await createApplication({
        company_id: companyId,
        role_title: values.role_title.trim(),
        url,
        location: values.location.trim() || null,
        remote_type: values.remote_type,
        notes: values.notes.trim() || null,
        jd_text: submittedJdText.trim() || null,
      }).unwrap();
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
