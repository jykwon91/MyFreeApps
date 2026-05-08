/**
 * CompanyConfirmStep — step-3 review form.
 *
 * Displays:
 * - A green banner ("Review and adjust before saving") with an optional
 *   AI-extracted summary and source URL.
 * - Company confirmation: either the pill (read-only) or the combobox
 *   (when the operator clicked "not right? change").
 * - The role-title, location, remote-type, and notes fields.
 * - Cancel + "Add application" submit buttons.
 *
 * All async logic is owned by the parent hook; this component is
 * presentation-only.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { type UseFormRegister, type FieldErrors } from "react-hook-form";
import { LoadingButton } from "@platform/ui";
import type { Company } from "@/types/company";
import type { DialogState, ReviewCompanyState } from "../useAddApplicationDialogState";
import CompanyCombobox from "../CompanyCombobox";
import CompanyConfirmationPill from "../CompanyConfirmationPill";
import type { AddApplicationFormValues } from "./useAddApplicationFlow";

const REMOTE_OPTIONS: { value: AddApplicationFormValues["remote_type"]; label: string }[] = [
  { value: "unknown", label: "Unknown" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
];

interface CompanyConfirmStepProps {
  state: Extract<DialogState, { kind: "review" }>;
  companies: Company[];
  register: UseFormRegister<AddApplicationFormValues>;
  errors: FieldErrors<AddApplicationFormValues>;
  creatingApplication: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onPillChangeRequest: () => void;
  onSelectExisting: (companyId: string, name: string) => void;
  onCreateOnTheFly: (name: string) => void;
  onCancelChangingCompany: () => void;
  companyNameValue: string;
  onCompanyNameChange: (next: string) => void;
}

export default function CompanyConfirmStep({
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
}: CompanyConfirmStepProps) {
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

// ---------------------------------------------------------------------------
// ReviewBanner
// ---------------------------------------------------------------------------

interface ReviewBannerProps {
  sourceUrl: string | null;
  summary: string | null;
}

function ReviewBanner({ sourceUrl, summary }: ReviewBannerProps) {
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

// ---------------------------------------------------------------------------
// ReviewCompanyDisplay — pill → combobox toggle orchestration.
// ---------------------------------------------------------------------------

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
  function handleChange() {
    onCompanyNameChange(company.name);
    onChangeRequest();
  }

  if (company.kind === "tracked") {
    return (
      <CompanyConfirmationPill
        name={company.name}
        logoUrl={company.logoUrl}
        variant="tracked"
        onChangeRequest={handleChange}
      />
    );
  }
  if (company.kind === "new" || company.kind === "manual") {
    return (
      <CompanyConfirmationPill
        name={company.name}
        logoUrl={company.kind === "manual" ? company.logoUrl : company.logoUrl}
        variant="new"
        onChangeRequest={handleChange}
      />
    );
  }
  // autoCreateFailed
  return (
    <CompanyConfirmationPill
      name={company.name || "(no company found)"}
      logoUrl={null}
      variant="error"
      onChangeRequest={handleChange}
    />
  );
}
