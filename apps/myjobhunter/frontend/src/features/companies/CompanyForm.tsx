import { useEffect, useId } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton } from "@platform/ui";
import type { CompanyCreateRequest } from "@/types/company-create-request";

export interface CompanyFormValues {
  name: string;
  primary_domain: string;
  industry: string;
  hq_location: string;
}

interface Props {
  onSubmit: (request: CompanyCreateRequest) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
  submitting?: boolean;
  /** Pre-fill fields — intended for future edit-in-place; no consumer uses this yet. */
  initialValues?: Partial<CompanyFormValues>;
  /** If true, focuses the name field on mount (default: true). */
  autoFocus?: boolean;
}

export default function CompanyForm({
  onSubmit,
  onCancel,
  submitLabel = "Add company",
  submitting = false,
  initialValues,
  autoFocus = true,
}: Props) {
  // Use React's useId so IDs are unique even when the form renders multiple
  // times in the same page (e.g. AddApplicationDialog + AddCompanyDialog open
  // at the same time in tests).
  const uid = useId();
  const nameId = `${uid}-name`;
  const domainId = `${uid}-domain`;
  const industryId = `${uid}-industry`;
  const hqId = `${uid}-hq`;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CompanyFormValues>({
    defaultValues: {
      name: initialValues?.name ?? "",
      primary_domain: initialValues?.primary_domain ?? "",
      industry: initialValues?.industry ?? "",
      hq_location: initialValues?.hq_location ?? "",
    },
  });

  // If initialValues changes (e.g. edit-in-place), sync the form.
  useEffect(() => {
    if (initialValues) {
      reset({
        name: initialValues.name ?? "",
        primary_domain: initialValues.primary_domain ?? "",
        industry: initialValues.industry ?? "",
        hq_location: initialValues.hq_location ?? "",
      });
    }
  }, [initialValues, reset]);

  const handleFormSubmit: SubmitHandler<CompanyFormValues> = async (values) => {
    await onSubmit({
      name: values.name.trim(),
      primary_domain: values.primary_domain.trim() || null,
      industry: values.industry.trim() || null,
      hq_location: values.hq_location.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor={nameId} className="block text-sm font-medium mb-1">
          Name <span className="text-destructive">*</span>
        </label>
        <input
          id={nameId}
          type="text"
          {...register("name", { required: "Name is required", minLength: 1 })}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          placeholder="e.g. Acme Corp"
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFocus}
        />
        {errors.name ? (
          <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor={domainId} className="block text-sm font-medium mb-1">
          Domain
        </label>
        <input
          id={domainId}
          type="text"
          {...register("primary_domain")}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          placeholder="acme.com"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Optional — must be unique across your companies if set.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={industryId} className="block text-sm font-medium mb-1">
            Industry
          </label>
          <input
            id={industryId}
            type="text"
            {...register("industry")}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            placeholder="e.g. SaaS"
          />
        </div>
        <div>
          <label htmlFor={hqId} className="block text-sm font-medium mb-1">
            HQ location
          </label>
          <input
            id={hqId}
            type="text"
            {...register("hq_location")}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            placeholder="e.g. SF, NYC"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border rounded-md hover:bg-muted min-h-[44px]"
        >
          Cancel
        </button>
        <LoadingButton type="submit" isLoading={submitting} loadingText="Saving...">
          {submitLabel}
        </LoadingButton>
      </div>
    </form>
  );
}
