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
import { useId } from "react";
import { type UseFormRegister, type UseFormWatch, type FieldErrors } from "react-hook-form";
import { FieldFeedback, fieldFeedbackAria, LoadingButton } from "@platform/ui";
import { addApplicationFormCounters } from "@myjobhunter/api-client/utils/addApplicationFormCounters";
import type { Company } from "@myjobhunter/api-client/types/company";
import type { DialogState } from "../useAddApplicationDialogState";
import type { AddApplicationFormValues } from "@myjobhunter/api-client/types/application/add-application-form-values";
import CompanyCombobox from "../CompanyCombobox";
import ReviewBanner from "./ReviewBanner";
import ReviewCompanyDisplay from "./ReviewCompanyDisplay";

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
  watch: UseFormWatch<AddApplicationFormValues>;
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
  watch,
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
  const uid = useId();
  const counters = addApplicationFormCounters(watch());
  const feedback = (field: "role_title" | "location" | "notes") => ({
    id: `${uid}-${field}`,
    error: errors[field]?.message,
    counter: counters[field],
  });
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
          <label htmlFor={`${uid}-role_title`} className="block text-sm font-medium mb-1">
            Role title <span className="text-destructive">*</span>
          </label>
          <input
            id={`${uid}-role_title`}
            type="text"
            {...fieldFeedbackAria(feedback("role_title"))}
            {...register("role_title")}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            placeholder="e.g. Senior Backend Engineer"
          />
          <FieldFeedback {...feedback("role_title")} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${uid}-location`} className="block text-sm font-medium mb-1">Location</label>
            <input
              id={`${uid}-location`}
              type="text"
              {...fieldFeedbackAria(feedback("location"))}
              {...register("location")}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              placeholder="e.g. SF, NYC, Remote-EU"
            />
            <FieldFeedback {...feedback("location")} />
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
          <label htmlFor={`${uid}-notes`} className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            id={`${uid}-notes`}
            {...fieldFeedbackAria(feedback("notes"))}
            {...register("notes")}
            rows={3}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            placeholder="Anything to remember about this role…"
          />
          <FieldFeedback {...feedback("notes")} />
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
