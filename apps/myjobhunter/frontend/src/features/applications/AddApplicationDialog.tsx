/**
 * AddApplicationDialog — redesigned 2026-05-06.
 *
 * Three-step state machine:
 *   1. INPUT       Operator pastes a URL (default), pastes JD text,
 *                  or types a company name for fully manual entry.
 *   2. PROCESSING  Spinner while the JD extract / parse mutation runs.
 *                  After 3s it swaps to "this is taking longer than usual…"
 *   3. REVIEW      The form is pre-filled (or empty for manual path);
 *                  the company is shown as a confirmation pill, NOT a
 *                  dropdown. Operator confirms / edits and submits.
 *
 * Operator workflow notes (verbatim from session):
 *   - "i don't want to manually input the company. the company should
 *      be derived with the job description, link, or some other way"
 *   - "manual entry is near useless"
 *   - "i don't like the dropdown approach. it was not obvious to me"
 *
 * Implementation notes
 * ====================
 * - The legacy `<select>` company picker + "+ New" inline panel are
 *   removed entirely. Company selection happens through:
 *     a) auto-create after JD extract (primary path)
 *     b) `CompanyCombobox` on the rare cases (manual entry / pill change /
 *        auto-create failure)
 * - The standalone URL field in the form body is removed. The URL the
 *   operator pasted in step 1 is the source URL, sent on submit.
 * - Paste-and-go: pasting any string starting with http(s):// into the
 *   URL input auto-triggers the fetch — no button click required.
 *
 * TODO (deferred from v1)
 * =======================
 * - Animated height transition between steps. The dialog jumps in size
 *   today; a v2 should use Framer Motion or `react-resize-observer` to
 *   smooth it out.
 */
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X, Loader2 } from "lucide-react";
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
import type { Company } from "@/types/company";
import type { JdParseResponse } from "@/types/application/jd-parse-response";
import type { JdUrlExtractResponse } from "@/types/application/jd-url-extract-response";
import { describeExtractError, isAuthRequiredError } from "./jdErrorRouting";
import CompanyCombobox from "./CompanyCombobox";
import CompanyConfirmationPill from "./CompanyConfirmationPill";
import {
  INITIAL_STATE,
  PROCESSING_LONG_RUNNING_THRESHOLD_MS,
  type DialogInputMode,
  type DialogState,
  type ReviewCompanyState,
} from "./useAddApplicationDialogState";

interface AddApplicationFormValues {
  role_title: string;
  location: string;
  remote_type: "unknown" | "remote" | "hybrid" | "onsite";
  notes: string;
}

const REMOTE_OPTIONS: { value: AddApplicationFormValues["remote_type"]; label: string }[] = [
  { value: "unknown", label: "Unknown" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
];

const URL_REGEX = /^https?:\/\/\S+$/i;
const NOTES_MAX_LEN = 5000;

export interface AddApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddApplicationDialog({ open, onOpenChange }: AddApplicationDialogProps) {
  const { data: companiesData } = useListCompaniesQuery();
  const [createApplication, { isLoading: creatingApplication }] = useCreateApplicationMutation();
  const [createCompany] = useCreateCompanyMutation();
  // Fire-and-forget — the operator does not wait on background research.
  const [triggerCompanyResearch] = useTriggerCompanyResearchMutation();
  const [parseJobDescription] = useParseJobDescriptionMutation();
  const [extractJdFromUrl] = useExtractJdFromUrlMutation();

  const [state, setState] = useState<DialogState>(INITIAL_STATE);
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [companyNameValue, setCompanyNameValue] = useState("");
  // Submit-time fallback: when auto-create raced with the click or
  // failed silently, retry create-or-select inline before the POST.
  const [pendingCompanyName, setPendingCompanyName] = useState<string | null>(null);
  // Snapshot of the JD text the operator pasted, persisted across the
  // text → review transition so the application body carries it.
  const [submittedJdText, setSubmittedJdText] = useState<string>("");

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<AddApplicationFormValues>({
    defaultValues: {
      role_title: "",
      location: "",
      remote_type: "unknown",
      notes: "",
    },
  });

  const companies = companiesData?.items ?? [];

  // -------------------------------------------------------------------------
  // Lifecycle — reset everything on close.
  // -------------------------------------------------------------------------
  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
      setState(INITIAL_STATE);
      setUrlValue("");
      setTextValue("");
      setCompanyNameValue("");
      setPendingCompanyName(null);
      setSubmittedJdText("");
    }
    onOpenChange(next);
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

  // Paste-and-go: when the operator pastes a string and the resulting
  // value is a complete URL, kick off the fetch immediately. Typing a
  // URL char-by-char does NOT trigger; only paste does, because partial
  // URLs are common while typing.
  function handleUrlPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").trim();
    if (URL_REGEX.test(pasted)) {
      // Stop the default paste — we'll set the value ourselves and fire.
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
      // Stash the name so the submit-time fallback can retry.
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
  // Step 2 — processing. URL extract path.
  // -------------------------------------------------------------------------
  async function runUrlExtract(url: string) {
    setState({ kind: "processing", sourcePath: "url", longRunning: false });
    try {
      const result = await extractJdFromUrl({ url }).unwrap();
      await applyExtractResult(result);
    } catch (err) {
      if (isAuthRequiredError(err)) {
        // Auth-walled URL — drop the operator into the text-paste lane
        // with a friendly message.
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

  // After 3s in processing, flip the longRunning flag so the spinner
  // copy updates from "Reading job posting…" to "This is taking longer
  // than usual…" — purely passive, no intervention.
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
  // Pre-fill helpers — both extract and parse routes converge through
  // these, then transition to "review".
  // -------------------------------------------------------------------------
  async function applyParseResult(
    result: JdParseResponse,
    { sourceUrl }: { sourceUrl: string | null },
  ) {
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

  /**
   * Resolve a company name extracted from the JD into a ReviewCompanyState.
   *
   * Order of preference:
   *   1. Case-insensitive name match against existing companies → "tracked"
   *   2. Auto-create via POST /companies → "new"
   *   3. Auto-create rejected → "autoCreateFailed" (submit-time fallback handles it)
   *   4. No name extracted → null company is forbidden by the form; we
   *      route to "autoCreateFailed" with an empty name so the operator
   *      sees the combobox immediately
   */
  async function resolveCompany(
    name: string | null,
    extras: CompanyExtras,
  ): Promise<ReviewCompanyState> {
    const trimmed = (name ?? "").trim();
    if (!trimmed) {
      // No company in the JD — let the operator fix via the combobox.
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
      const payload: { name: string; primary_domain?: string | null; logo_url?: string | null } = {
        name: trimmed,
      };
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
      showError(
        `Couldn't auto-create company "${trimmed}": ${extractErrorMessage(err)}`,
      );
      // Keep pendingCompanyName so the submit handler can retry.
      return { kind: "autoCreateFailed", name: trimmed };
    }
  }

  // -------------------------------------------------------------------------
  // Step 3 — review. "Not right? change" expands the combobox.
  // -------------------------------------------------------------------------
  function handlePillChangeRequest() {
    if (state.kind !== "review") return;
    setState({ ...state, changingCompany: true });
    // Pre-populate the combobox with the current company name so the
    // operator can edit a typo rather than retype.
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

  // -------------------------------------------------------------------------
  // Submit — applies the submit-time fallback for races / failed creates.
  // -------------------------------------------------------------------------
  const onSubmit: SubmitHandler<AddApplicationFormValues> = async (values) => {
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
      // The "URL" field is the source URL the operator pasted in step 1;
      // for the manual / text path it's null.
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
      showSuccess("Application added");
      onOpenChange(false);
    } catch (err) {
      showError(`Couldn't create application: ${extractErrorMessage(err)}`);
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg max-h-[90vh] overflow-y-auto bg-card border rounded-lg shadow-lg z-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">Add application</Dialog.Title>
            <Dialog.Close asChild>
              <button
                aria-label="Close"
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {state.kind === "input" ? (
            <InputStep
              inputMode={state.inputMode}
              urlValue={urlValue}
              textValue={textValue}
              companyNameValue={companyNameValue}
              companies={companies}
              onSetInputMode={setInputMode}
              onUrlChange={handleUrlInputChange}
              onUrlPaste={handleUrlPaste}
              onUrlSubmit={handleUrlSubmit}
              onTextChange={setTextValue}
              onTextSubmit={handleTextSubmit}
              onCompanyNameSelect={handleCompanyNameSelectExisting}
              onCompanyNameCreate={handleCompanyNameCreateOnTheFly}
            />
          ) : null}

          {state.kind === "processing" ? (
            <ProcessingStep longRunning={state.longRunning} sourcePath={state.sourcePath} />
          ) : null}

          {state.kind === "review" ? (
            <ReviewStep
              state={state}
              companies={companies}
              register={register}
              errors={errors}
              creatingApplication={creatingApplication}
              onSubmit={handleSubmit(onSubmit)}
              onPillChangeRequest={handlePillChangeRequest}
              onSelectExisting={handleReviewSelectExisting}
              onCreateOnTheFly={handleReviewCreateOnTheFly}
              onCancelChangingCompany={() =>
                setState({ ...state, changingCompany: false })
              }
              companyNameValue={companyNameValue}
              onCompanyNameChange={setCompanyNameValue}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCompanyByName(companies: Company[], name: string): Company | undefined {
  const trimmed = name.trim().toLowerCase();
  return companies.find((c) => c.name.trim().toLowerCase() === trimmed);
}

function readCompanyId(company: ReviewCompanyState): string | null {
  if (company.kind === "tracked" || company.kind === "new") return company.companyId;
  if (company.kind === "manual") return company.companyId;
  return null;
}

/**
 * Reduce a company website URL to its bare host (no scheme, no
 * leading "www.", no trailing slash). The Company model's
 * `primary_domain` is a domain string, not a URL.
 */
function websiteToDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.trim());
    let host = url.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    return host || null;
  } catch {
    const stripped = website.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
    return stripped.replace(/^www\./i, "") || null;
  }
}

function combineNotes(result: JdUrlExtractResponse): string | null {
  const chunks: string[] = [];
  if (result.summary) chunks.push(result.summary);
  if (result.description_html) {
    const stripped = stripHtml(result.description_html).trim();
    if (stripped) chunks.push(stripped);
  }
  if (result.requirements_text) chunks.push(result.requirements_text);
  if (chunks.length === 0) return null;
  const combined = chunks.join("\n\n");
  return combined.length > NOTES_MAX_LEN ? combined.slice(0, NOTES_MAX_LEN) : combined;
}

function stripHtml(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/?\s*(p|li|div|h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Step 1 — Input
// ---------------------------------------------------------------------------

interface InputStepProps {
  inputMode: DialogInputMode;
  urlValue: string;
  textValue: string;
  companyNameValue: string;
  companies: Company[];
  onSetInputMode: (mode: DialogInputMode) => void;
  onUrlChange: (next: string) => void;
  onUrlPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  onUrlSubmit: () => void;
  onTextChange: (next: string) => void;
  onTextSubmit: () => void;
  onCompanyNameSelect: (companyId: string, name: string) => void;
  onCompanyNameCreate: (name: string) => void;
}

function InputStep(props: InputStepProps) {
  if (props.inputMode === "url") return <UrlInputPanel {...props} />;
  if (props.inputMode === "text") return <TextInputPanel {...props} />;
  return <CompanyNamePanel {...props} />;
}

function UrlInputPanel({
  urlValue,
  onUrlChange,
  onUrlPaste,
  onUrlSubmit,
  onSetInputMode,
}: InputStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus on mount — the dialog opens directly into this input.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const canSubmit = urlValue.trim().length > 0;

  return (
    <div className="space-y-3">
      <label htmlFor="add-app-url" className="block text-sm font-medium">
        Job posting URL — paste to auto-fill
      </label>
      <input
        id="add-app-url"
        ref={inputRef}
        type="url"
        value={urlValue}
        onChange={(e) => onUrlChange(e.target.value)}
        onPaste={onUrlPaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSubmit) {
            e.preventDefault();
            onUrlSubmit();
          }
        }}
        placeholder="https://jobs.example.com/posting/abc"
        aria-label="Job posting URL"
        className="w-full border rounded-md px-3 py-2 text-sm bg-background"
      />
      <div className="flex justify-end">
        <LoadingButton
          type="button"
          isLoading={false}
          loadingText="Reading…"
          disabled={!canSubmit}
          onClick={onUrlSubmit}
        >
          Auto-fill
        </LoadingButton>
      </div>
      <div className="flex flex-col gap-1 pt-2 border-t">
        <button
          type="button"
          onClick={() => onSetInputMode("text")}
          className="text-xs underline text-muted-foreground hover:text-foreground self-start"
        >
          No URL? Paste the description text instead.
        </button>
        <button
          type="button"
          onClick={() => onSetInputMode("company-name")}
          className="text-xs underline text-muted-foreground hover:text-foreground self-start"
        >
          Adding manually? Type a company name.
        </button>
      </div>
    </div>
  );
}

function TextInputPanel({
  textValue,
  onTextChange,
  onTextSubmit,
  onSetInputMode,
}: InputStepProps) {
  const canSubmit = textValue.trim().length > 0;
  return (
    <div className="space-y-3">
      <label htmlFor="add-app-text" className="block text-sm font-medium">
        Paste the job description text
      </label>
      <textarea
        id="add-app-text"
        value={textValue}
        onChange={(e) => onTextChange(e.target.value)}
        rows={8}
        placeholder="Paste the full job description here…"
        aria-label="Job description text"
        autoFocus
        className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-y"
      />
      <div className="flex justify-end">
        <LoadingButton
          type="button"
          isLoading={false}
          loadingText="Parsing…"
          disabled={!canSubmit}
          onClick={onTextSubmit}
        >
          Parse with AI
        </LoadingButton>
      </div>
      <div className="flex flex-col gap-1 pt-2 border-t">
        <button
          type="button"
          onClick={() => onSetInputMode("url")}
          className="text-xs underline text-muted-foreground hover:text-foreground self-start"
        >
          Have a URL instead? Paste it here.
        </button>
        <button
          type="button"
          onClick={() => onSetInputMode("company-name")}
          className="text-xs underline text-muted-foreground hover:text-foreground self-start"
        >
          Adding manually? Type a company name.
        </button>
      </div>
    </div>
  );
}

function CompanyNamePanel({
  companies,
  companyNameValue,
  onCompanyNameSelect,
  onCompanyNameCreate,
  onSetInputMode,
}: InputStepProps) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Company name</label>
      <CompanyCombobox
        companies={companies}
        initialValue={companyNameValue}
        onSelect={onCompanyNameSelect}
        onCreate={onCompanyNameCreate}
        onCancel={() => onSetInputMode("url")}
      />
      <div className="pt-2 border-t">
        <button
          type="button"
          onClick={() => onSetInputMode("url")}
          className="text-xs underline text-muted-foreground hover:text-foreground"
        >
          Have a URL? Paste it instead — we'll auto-fill from the page.
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Processing
// ---------------------------------------------------------------------------

interface ProcessingStepProps {
  longRunning: boolean;
  sourcePath: "url" | "text";
}

function ProcessingStep({ longRunning, sourcePath }: ProcessingStepProps) {
  const primaryCopy =
    sourcePath === "url" ? "Reading job posting…" : "Reading description…";
  const longRunningCopy = "This is taking longer than usual…";
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <Loader2 size={28} className="animate-spin text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-center">
        {longRunning ? longRunningCopy : primaryCopy}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Review
// ---------------------------------------------------------------------------

interface ReviewStepProps {
  state: Extract<DialogState, { kind: "review" }>;
  companies: Company[];
  register: ReturnType<typeof useForm<AddApplicationFormValues>>["register"];
  errors: ReturnType<typeof useForm<AddApplicationFormValues>>["formState"]["errors"];
  creatingApplication: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onPillChangeRequest: () => void;
  onSelectExisting: (companyId: string, name: string) => void;
  onCreateOnTheFly: (name: string) => void;
  onCancelChangingCompany: () => void;
  companyNameValue: string;
  onCompanyNameChange: (next: string) => void;
}

function ReviewStep({
  state,
  companies,
  register,
  errors,
  creatingApplication,
  onSubmit,
  onPillChangeRequest,
  onSelectExisting,
  onCreateOnTheFly,
  onCancelChangingCompany,
  companyNameValue,
  onCompanyNameChange,
}: ReviewStepProps) {
  return (
    <div className="space-y-4">
      <ReviewBanner sourceUrl={state.sourceUrl} summary={state.summary} />

      <div>
        <label className="block text-sm font-medium mb-1">
          Company <span className="text-destructive">*</span>
        </label>
        {state.changingCompany ? (
          <div className="space-y-2">
            <CompanyCombobox
              // Remount when the seed name changes — the combobox
              // doesn't sync `query` with `initialValue` on update.
              key={`change-${companyNameValue}`}
              companies={companies}
              initialValue={companyNameValue}
              onSelect={onSelectExisting}
              onCreate={onCreateOnTheFly}
              onCancel={onCancelChangingCompany}
            />
            <button
              type="button"
              onClick={onCancelChangingCompany}
              className="text-xs underline text-muted-foreground hover:text-foreground"
            >
              Cancel — keep the current selection
            </button>
          </div>
        ) : (
          <ReviewCompanyDisplay
            company={state.company}
            onChangeRequest={onPillChangeRequest}
            onCompanyNameChange={onCompanyNameChange}
          />
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-sm font-medium mb-1">
            Role title <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            {...register("role_title", { required: "Role title is required", minLength: 1 })}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            placeholder="e.g. Senior Backend Engineer"
          />
          {errors.role_title ? (
            <p className="text-xs text-destructive mt-1">{errors.role_title.message}</p>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Location</label>
            <input
              type="text"
              {...register("location")}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              placeholder="e.g. SF, NYC, Remote-EU"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Remote</label>
            <select
              {...register("remote_type")}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            >
              {REMOTE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            {...register("notes")}
            rows={3}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            placeholder="Anything to remember about this role…"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Dialog.Close asChild>
            <button
              type="button"
              className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
            >
              Cancel
            </button>
          </Dialog.Close>
          <LoadingButton type="submit" isLoading={creatingApplication} loadingText="Adding…">
            Add application
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}

interface ReviewBannerProps {
  sourceUrl: string | null;
  summary: string | null;
}

function ReviewBanner({ sourceUrl, summary }: ReviewBannerProps) {
  // For the manual path (no JD), we still show a green strip so the
  // step transition feels consistent — but with a quieter tone.
  return (
    <div className="rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3">
      <p className="text-sm font-medium text-green-800 dark:text-green-300">
        Review and adjust before saving
      </p>
      {summary ? (
        <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 line-clamp-2">
          {summary}
        </p>
      ) : null}
      {sourceUrl ? (
        <p className="text-xs text-muted-foreground mt-1 truncate">
          Source: <span className="underline">{sourceUrl}</span>
        </p>
      ) : null}
    </div>
  );
}

interface ReviewCompanyDisplayProps {
  company: ReviewCompanyState;
  onChangeRequest: () => void;
  onCompanyNameChange: (next: string) => void;
}

function ReviewCompanyDisplay({
  company,
  onChangeRequest,
  onCompanyNameChange,
}: ReviewCompanyDisplayProps) {
  if (company.kind === "tracked") {
    return (
      <CompanyConfirmationPill
        name={company.name}
        logoUrl={company.logoUrl}
        variant="tracked"
        onChangeRequest={() => {
          onCompanyNameChange(company.name);
          onChangeRequest();
        }}
      />
    );
  }
  if (company.kind === "new") {
    return (
      <CompanyConfirmationPill
        name={company.name}
        logoUrl={company.logoUrl}
        variant="new"
        onChangeRequest={() => {
          onCompanyNameChange(company.name);
          onChangeRequest();
        }}
      />
    );
  }
  if (company.kind === "manual") {
    return (
      <CompanyConfirmationPill
        name={company.name}
        logoUrl={company.logoUrl}
        variant="new"
        onChangeRequest={() => {
          onCompanyNameChange(company.name);
          onChangeRequest();
        }}
      />
    );
  }
  // autoCreateFailed
  return (
    <CompanyConfirmationPill
      name={company.name || "(no company found)"}
      logoUrl={null}
      variant="error"
      onChangeRequest={() => {
        onCompanyNameChange(company.name);
        onChangeRequest();
      }}
    />
  );
}
