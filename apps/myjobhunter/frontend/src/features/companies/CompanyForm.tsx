import { useEffect, useId } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton } from "@platform/ui";
import { companyCreateRequest } from "@myjobhunter/api-client/utils/companyCreateRequest";
import type { CompanyFormValues } from "@myjobhunter/api-client/types/company/company-form-values";
import type { CompanyFormProps } from "@/types/company/company-form-props";
import { companyFieldValidator } from "./companyFieldValidator";

export default function CompanyForm({
  onSubmit,
  onCancel,
  submitLabel = "Add company",
  submitting = false,
  initialValues,
  autoFocus = true,
}: CompanyFormProps) {
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
    setError,
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
    const refused = await onSubmit(companyCreateRequest(values));
    for (const [field, message] of Object.entries(refused ?? {}) as [keyof CompanyFormValues, string][]) {
      setError(field, { type: "server", message });
    }
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
          {...register("name", { validate: companyFieldValidator("name") })}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          placeholder="e.g. Acme Corp"
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
          {...register("primary_domain", { validate: companyFieldValidator("primary_domain") })}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          placeholder="acme.com"
        />
        {errors.primary_domain ? (
          <p className="text-xs text-destructive mt-1">{errors.primary_domain.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            Optional — must be unique across your companies if set.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={industryId} className="block text-sm font-medium mb-1">
            Industry
          </label>
          <input
            id={industryId}
            type="text"
            {...register("industry", { validate: companyFieldValidator("industry") })}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            placeholder="e.g. SaaS"
          />
          {errors.industry ? (
            <p className="text-xs text-destructive mt-1">{errors.industry.message}</p>
          ) : null}
        </div>
        <div>
          <label htmlFor={hqId} className="block text-sm font-medium mb-1">
            HQ location
          </label>
          <input
            id={hqId}
            type="text"
            {...register("hq_location", { validate: companyFieldValidator("hq_location") })}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            placeholder="e.g. SF, NYC"
          />
          {errors.hq_location ? (
            <p className="text-xs text-destructive mt-1">{errors.hq_location.message}</p>
          ) : null}
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
