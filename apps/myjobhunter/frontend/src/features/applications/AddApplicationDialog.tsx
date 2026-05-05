import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X, Plus, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { useListCompaniesQuery, useCreateCompanyMutation } from "@/lib/companiesApi";
import { useCreateApplicationMutation, useParseJobDescriptionMutation } from "@/lib/applicationsApi";
import type { CompanyCreateRequest } from "@/types/company-create-request";
import CompanyForm from "@/features/companies/CompanyForm";
import type { JdParseMode } from "./useJdParseMode";
import { JD_PARSE_MODE_IDLE } from "./useJdParseMode";

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
  const [parseJobDescription, { isLoading: parsing }] = useParseJobDescriptionMutation();

  const [showNewCompany, setShowNewCompany] = useState(false);
  const [jdMode, setJdMode] = useState<JdParseMode>(JD_PARSE_MODE_IDLE);

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
    }
    onOpenChange(next);
  }

  const onSubmit: SubmitHandler<AddApplicationFormValues> = async (values) => {
    try {
      await createApplication({
        company_id: values.company_id,
        role_title: values.role_title.trim(),
        url: values.url.trim() || null,
        location: values.location.trim() || null,
        remote_type: values.remote_type,
        notes: values.notes.trim() || null,
        // Preserve the pasted JD text if the user went through the parse flow.
        jd_text:
          jdMode.kind === "pasting" || jdMode.kind === "parsing"
            ? jdMode.jdText.trim() || null
            : null,
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

  async function handleParseJd() {
    if (jdMode.kind !== "pasting" || !jdMode.jdText.trim()) return;

    const jdText = jdMode.jdText;
    setJdMode({ kind: "parsing", jdText });

    try {
      const result = await parseJobDescription({ jd_text: jdText }).unwrap();

      // Pre-fill form fields with Claude's extracted values where non-null.
      if (result.title) {
        setValue("role_title", result.title, { shouldValidate: true });
      }
      if (result.location) {
        setValue("location", result.location, { shouldValidate: true });
      }
      if (result.remote_type && result.remote_type !== "unknown") {
        setValue(
          "remote_type",
          result.remote_type as AddApplicationFormValues["remote_type"],
          { shouldValidate: true },
        );
      }

      setJdMode({ kind: "parsed", summary: result.summary });
    } catch (err) {
      setJdMode({
        kind: "failed",
        errorMessage:
          extractErrorMessage(err) ?? "AI parsing failed — please fill fields manually",
      });
    }
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

          {/* JD paste + parse section — collapses after a successful parse */}
          <JdParseSection
            mode={jdMode}
            parsing={parsing}
            onToggle={() =>
              setJdMode((prev) =>
                prev.kind === "idle"
                  ? { kind: "pasting", jdText: "" }
                  : JD_PARSE_MODE_IDLE,
              )
            }
            onTextChange={(text) => setJdMode({ kind: "pasting", jdText: text })}
            onParse={handleParseJd}
            onDismiss={() => setJdMode(JD_PARSE_MODE_IDLE)}
          />

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium mb-1">
                Company <span className="text-destructive">*</span>
              </label>
              {showNewCompany ? (
                // Inline panel — NOT a nested Dialog (a11y rule: no dialogs inside dialogs).
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
                    {...register("company_id", { required: "Company is required" })}
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
// JdParseSection — isolated sub-component for the paste + parse UX.
// Extracted to keep the parent component lean.
// ---------------------------------------------------------------------------

interface JdParseSectionProps {
  mode: JdParseMode;
  parsing: boolean;
  onToggle: () => void;
  onTextChange: (text: string) => void;
  onParse: () => void;
  onDismiss: () => void;
}

function JdParseSection({
  mode,
  parsing,
  onToggle,
  onTextChange,
  onParse,
  onDismiss,
}: JdParseSectionProps) {
  if (mode.kind === "parsed") {
    return (
      <div className="mb-4 rounded-md border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-green-800 dark:text-green-300">
            Fields pre-filled from JD
          </p>
          {mode.summary ? (
            <p className="text-xs text-green-700 dark:text-green-400 mt-0.5 line-clamp-2">
              {mode.summary}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground mt-1">
            Review and adjust the fields below before saving.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
          aria-label="Dismiss parse result"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  if (mode.kind === "failed") {
    return (
      <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-destructive">AI parsing failed</p>
          <p className="text-xs text-muted-foreground mt-0.5">{mode.errorMessage}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
          aria-label="Dismiss error"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  if (mode.kind === "idle") {
    return (
      <div className="mb-4">
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Sparkles size={14} />
          Paste job description to auto-fill
          <ChevronDown size={14} />
        </button>
      </div>
    );
  }

  // mode.kind === "pasting" | "parsing"
  const jdText = mode.jdText;
  const canParse = jdText.trim().length > 0;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <Sparkles size={14} />
          Job description
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Collapse job description panel"
        >
          <ChevronUp size={14} />
        </button>
      </div>

      <textarea
        value={jdText}
        onChange={(e) => onTextChange(e.target.value)}
        rows={6}
        placeholder="Paste the full job description here…"
        className="w-full border rounded-md px-3 py-2 text-sm bg-background resize-y"
        disabled={parsing}
        aria-label="Job description text"
      />

      <LoadingButton
        type="button"
        isLoading={parsing}
        loadingText="Parsing…"
        disabled={!canParse || parsing}
        onClick={onParse}
      >
        Parse with AI
      </LoadingButton>
    </div>
  );
}
