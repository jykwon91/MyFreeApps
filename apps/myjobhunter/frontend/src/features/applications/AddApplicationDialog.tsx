import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X, Plus } from "lucide-react";
import { useListCompaniesQuery, useCreateCompanyMutation } from "@/lib/companiesApi";
import {
  useCreateApplicationMutation,
  useExtractJdFromUrlMutation,
  useParseJobDescriptionMutation,
} from "@/lib/applicationsApi";
import type { CompanyCreateRequest } from "@/types/company-create-request";
import type { JdParseResponse } from "@/types/application/jd-parse-response";
import type { JdUrlExtractResponse } from "@/types/application/jd-url-extract-response";
import CompanyForm from "@/features/companies/CompanyForm";
import { JdAutoFillSection } from "./JdAutoFillSection";
import type { JdInputTab, JdParseMode } from "./useJdParseMode";
import { JD_INPUT_TAB_DEFAULT, JD_PARSE_MODE_IDLE } from "./useJdParseMode";
import { describeExtractError, isAuthRequiredError } from "./jdErrorRouting";

interface AddApplicationFormValues {
  company_id: string;
  role_title: string;
  url: string;
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

export interface AddApplicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddApplicationDialog({ open, onOpenChange }: AddApplicationDialogProps) {
  const { data: companiesData, isLoading: companiesLoading } = useListCompaniesQuery();
  const [createApplication, { isLoading: creatingApplication }] = useCreateApplicationMutation();
  const [createCompany, { isLoading: creatingCompany }] = useCreateCompanyMutation();
  const [parseJobDescription] = useParseJobDescriptionMutation();
  const [extractJdFromUrl] = useExtractJdFromUrlMutation();

  const [showNewCompany, setShowNewCompany] = useState(false);
  const [jdMode, setJdMode] = useState<JdParseMode>(JD_PARSE_MODE_IDLE);
  const [jdTab, setJdTab] = useState<JdInputTab>(JD_INPUT_TAB_DEFAULT);
  // Persist the buffers across tab switches so the user doesn't lose what
  // they typed in one tab when they peek at the other.
  const [pastedJdText, setPastedJdText] = useState("");
  const [pastedUrl, setPastedUrl] = useState("");
  // Holds the company name returned by extract / parse so the submit
  // handler can defensively auto-create the company at submit time if
  // ``selectOrCreateCompany`` either didn't run or didn't propagate
  // before the operator clicked submit. Cleared on close.
  const [pendingCompanyName, setPendingCompanyName] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<AddApplicationFormValues>({
    defaultValues: {
      company_id: "",
      role_title: "",
      url: "",
      location: "",
      remote_type: "unknown",
      notes: "",
    },
  });

  // Reset form + all panel states when the dialog closes so a re-open starts fresh.
  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
      setShowNewCompany(false);
      setJdMode(JD_PARSE_MODE_IDLE);
      setJdTab(JD_INPUT_TAB_DEFAULT);
      setPastedJdText("");
      setPastedUrl("");
      setPendingCompanyName(null);
    }
    onOpenChange(next);
  }

  const onSubmit: SubmitHandler<AddApplicationFormValues> = async (values) => {
    // Resilience: if the JD extract gave us a company name but the
    // auto-create either raced with the submit click or silently
    // failed, retry the create-or-select here. Without this fallback
    // the operator has to manually open "+ New" and re-type the name.
    let companyId = values.company_id;
    if (!companyId && pendingCompanyName) {
      try {
        const trimmed = pendingCompanyName.trim();
        const existing = companies.find(
          (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
        );
        if (existing) {
          companyId = existing.id;
        } else {
          const created = await createCompany({ name: trimmed }).unwrap();
          companyId = created.id;
        }
        setValue("company_id", companyId, { shouldValidate: true });
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
      await createApplication({
        company_id: companyId,
        role_title: values.role_title.trim(),
        url: values.url.trim() || null,
        location: values.location.trim() || null,
        remote_type: values.remote_type,
        notes: values.notes.trim() || null,
        // Preserve the pasted JD text if the user went through the parse flow.
        // The URL-extract path doesn't capture raw JD text — that lives in
        // description_html on the JdUrlExtractResponse and is not yet sent on.
        jd_text: pastedJdText.trim() || null,
      }).unwrap();
      showSuccess("Application added");
      onOpenChange(false);
    } catch (err) {
      showError(`Couldn't create application: ${extractErrorMessage(err)}`);
    }
  };

  const handleCreateCompany = async (request: CompanyCreateRequest) => {
    try {
      const created = await createCompany(request).unwrap();
      showSuccess(`Company "${created.name}" created`);
      // Auto-select the new company in the application dropdown.
      setValue("company_id", created.id, { shouldValidate: true });
      setShowNewCompany(false);
    } catch (err) {
      showError(`Couldn't create company: ${extractErrorMessage(err)}`);
    }
  };

  // -------------------------------------------------------------------------
  // JD parse flow — paste-text path (existing)
  // -------------------------------------------------------------------------
  async function handleParseJd() {
    if (!pastedJdText.trim()) return;
    setJdMode({ kind: "parsing", jdText: pastedJdText });
    try {
      const result = await parseJobDescription({ jd_text: pastedJdText }).unwrap();
      applyParseResult(result, { sourceUrl: null });
    } catch (err) {
      setJdMode({
        kind: "failed",
        errorMessage:
          extractErrorMessage(err) ?? "AI parsing failed — please fill fields manually",
      });
    }
  }

  // -------------------------------------------------------------------------
  // JD extract flow — URL path (new)
  // -------------------------------------------------------------------------
  async function handleFetchUrl() {
    const url = pastedUrl.trim();
    if (!url) return;
    setJdMode({ kind: "extracting", url });
    try {
      const result = await extractJdFromUrl({ url }).unwrap();
      await applyExtractResult(result);
    } catch (err) {
      if (isAuthRequiredError(err)) {
        setJdMode({ kind: "authRequired", url });
        return;
      }
      setJdMode({
        kind: "failed",
        errorMessage: describeExtractError(err),
      });
    }
  }

  // Pre-fill helper — both the text-parse and URL-extract paths converge here
  // (text-parse calls applyParseResult; URL-extract maps to a JdParseResponse
  // shape via mapExtractToParse and then calls the same).
  function applyParseResult(
    result: JdParseResponse,
    { sourceUrl }: { sourceUrl: string | null },
  ) {
    if (result.title) {
      setValue("role_title", result.title, { shouldValidate: true });
    }
    if (result.location) {
      setValue("location", result.location, { shouldValidate: true });
    }
    if (
      result.remote_type === "remote" ||
      result.remote_type === "hybrid" ||
      result.remote_type === "onsite"
    ) {
      setValue("remote_type", result.remote_type, { shouldValidate: true });
    }
    setJdMode({ kind: "parsed", summary: result.summary, sourceUrl });
  }

  async function applyExtractResult(result: JdUrlExtractResponse) {
    // Echo the source URL into the form's URL field so the operator
    // doesn't have to paste it twice.
    setValue("url", result.source_url, { shouldValidate: true });
    if (result.title) {
      setValue("role_title", result.title, { shouldValidate: true });
    }
    if (result.location) {
      setValue("location", result.location, { shouldValidate: true });
    }
    // Combine description + requirements into the notes field as a
    // best-effort scaffold the operator can edit. We strip HTML tags
    // here client-side because the form's notes field is plain text.
    const notesScaffold = combineNotes(result);
    if (notesScaffold) {
      setValue("notes", notesScaffold, { shouldValidate: true });
    }
    // Auto-find-or-create the company so the operator doesn't have to
    // manually re-enter what we already extracted. Case-insensitive
    // match against existing companies; create on miss. Also stash
    // the name in ``pendingCompanyName`` so the submit handler has a
    // fallback if the auto-create raced with the click.
    if (result.company) {
      setPendingCompanyName(result.company);
      await selectOrCreateCompany(result.company);
    } else {
      setPendingCompanyName(null);
    }
    setJdMode({
      kind: "parsed",
      summary: result.summary,
      sourceUrl: result.source_url,
    });
  }

  async function selectOrCreateCompany(name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = companies.find(
      (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (existing) {
      setValue("company_id", existing.id, { shouldValidate: true });
      return;
    }
    try {
      const created = await createCompany({ name: trimmed }).unwrap();
      setValue("company_id", created.id, { shouldValidate: true });
    } catch (err) {
      // Don't block the rest of the pre-fill if company create fails —
      // operator can still pick or create one manually. Surface the
      // error so they know what happened.
      showError(
        `Couldn't auto-create company "${trimmed}": ${extractErrorMessage(err)}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Tab switching — preserves the buffer of the OTHER tab so the user can
  // flip without losing input.
  // -------------------------------------------------------------------------
  function handleSwitchTab(next: JdInputTab) {
    setJdTab(next);
    if (next === "url") {
      setJdMode({ kind: "fetching", url: pastedUrl });
    } else {
      setJdMode({ kind: "pasting", jdText: pastedJdText });
    }
  }

  function handleExpand() {
    // Expand into whichever tab is currently selected, defaulting to URL.
    if (jdTab === "url") {
      setJdMode({ kind: "fetching", url: pastedUrl });
    } else {
      setJdMode({ kind: "pasting", jdText: pastedJdText });
    }
  }

  function handleCollapse() {
    setJdMode(JD_PARSE_MODE_IDLE);
  }

  function handleDismiss() {
    setJdMode(JD_PARSE_MODE_IDLE);
  }

  function handleUrlChange(url: string) {
    setPastedUrl(url);
    setJdMode({ kind: "fetching", url });
  }

  function handleTextChange(text: string) {
    setPastedJdText(text);
    setJdMode({ kind: "pasting", jdText: text });
  }

  const companies = companiesData?.items ?? [];
  const hasCompanies = companies.length > 0;

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

          <JdAutoFillSection
            mode={jdMode}
            tab={jdTab}
            onExpand={handleExpand}
            onCollapse={handleCollapse}
            onSwitchTab={handleSwitchTab}
            onUrlChange={handleUrlChange}
            onTextChange={handleTextChange}
            onFetch={handleFetchUrl}
            onParse={handleParseJd}
            onDismiss={handleDismiss}
          />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium mb-1">
                Company <span className="text-destructive">*</span>
              </label>
              {showNewCompany ? (
                <div className="border rounded-md p-4 bg-muted/30">
                  <p className="text-xs font-medium text-muted-foreground mb-3">New company</p>
                  <CompanyForm
                    onSubmit={handleCreateCompany}
                    onCancel={() => setShowNewCompany(false)}
                    submitLabel="Create company"
                    submitting={creatingCompany}
                    autoFocus={true}
                  />
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    {...register("company_id", {
                      // Validation passes if either a company is selected
                      // OR a pending JD-extract company name is staged for
                      // on-submit auto-create. Without the second branch,
                      // form-level validation fails before our submit
                      // handler gets a chance to run the fallback create.
                      validate: (value) =>
                        Boolean(value) || Boolean(pendingCompanyName)
                          ? true
                          : "Company is required",
                    })}
                    disabled={companiesLoading || !hasCompanies}
                    className="flex-1 border rounded-md px-3 py-2 text-sm bg-background"
                  >
                    <option value="">{hasCompanies ? "Select a company..." : "No companies yet"}</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewCompany(true)}
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-md hover:bg-muted whitespace-nowrap min-h-[44px]"
                    aria-label="Add new company"
                  >
                    <Plus size={14} />
                    New
                  </button>
                </div>
              )}
              {errors.company_id ? (
                <p className="text-xs text-destructive mt-1">{errors.company_id.message}</p>
              ) : null}
            </div>

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

            <div>
              <label className="block text-sm font-medium mb-1">URL</label>
              <input
                type="url"
                {...register("url")}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                placeholder="https://..."
              />
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
                    <option key={o.value} value={o.value}>{o.label}</option>
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
                placeholder="Anything to remember about this role..."
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
              <LoadingButton
                type="submit"
                isLoading={creatingApplication}
                loadingText="Adding..."
              >
                Add application
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------------------
// Notes field scaffold — combine description + requirements text from the
// URL-extract response into a single Markdown-friendly block. Plain-text
// strip the description because the notes textarea is not HTML-aware.
// ---------------------------------------------------------------------------

function combineNotes(result: JdUrlExtractResponse): string | null {
  const chunks: string[] = [];
  if (result.summary) {
    chunks.push(result.summary);
  }
  if (result.description_html) {
    const stripped = stripHtml(result.description_html).trim();
    if (stripped) {
      chunks.push(stripped);
    }
  }
  if (result.requirements_text) {
    chunks.push(result.requirements_text);
  }
  if (chunks.length === 0) return null;
  // Truncate to the form's documented notes max so we don't blow past it.
  const combined = chunks.join("\n\n");
  return combined.length > NOTES_MAX_LEN ? combined.slice(0, NOTES_MAX_LEN) : combined;
}

const NOTES_MAX_LEN = 5000;

function stripHtml(html: string): string {
  // Conservative client-side strip — replace tags with newlines so paragraph
  // structure survives, then collapse runs of whitespace. We do NOT use
  // dangerouslySetInnerHTML or a full HTML sanitiser here — the notes
  // field is plain text on submission.
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
