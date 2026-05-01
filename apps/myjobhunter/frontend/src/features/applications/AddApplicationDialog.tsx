import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X, Plus } from "lucide-react";
import { useListCompaniesQuery, useCreateCompanyMutation } from "@/lib/companiesApi";
import { useCreateApplicationMutation } from "@/lib/applicationsApi";

interface FormValues {
  company_id: string;
  role_title: string;
  url: string;
  location: string;
  remote_type: "unknown" | "remote" | "hybrid" | "onsite";
  notes: string;
}

interface NewCompanyValues {
  name: string;
  primary_domain: string;
}

const REMOTE_OPTIONS: { value: FormValues["remote_type"]; label: string }[] = [
  { value: "unknown", label: "Unknown" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AddApplicationDialog({ open, onOpenChange }: Props) {
  const { data: companiesData, isLoading: companiesLoading } = useListCompaniesQuery();
  const [createApplication, { isLoading: creatingApplication }] = useCreateApplicationMutation();
  const [createCompany, { isLoading: creatingCompany }] = useCreateCompanyMutation();

  const [showNewCompany, setShowNewCompany] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm<FormValues>({
    defaultValues: {
      company_id: "",
      role_title: "",
      url: "",
      location: "",
      remote_type: "unknown",
      notes: "",
    },
  });

  const newCompanyForm = useForm<NewCompanyValues>({
    defaultValues: { name: "", primary_domain: "" },
  });

  // Reset both forms when the dialog closes so a re-open starts fresh.
  useEffect(() => {
    if (!open) {
      reset();
      newCompanyForm.reset();
      setShowNewCompany(false);
    }
  }, [open, reset, newCompanyForm]);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    try {
      await createApplication({
        company_id: values.company_id,
        role_title: values.role_title.trim(),
        url: values.url.trim() || null,
        location: values.location.trim() || null,
        remote_type: values.remote_type,
        notes: values.notes.trim() || null,
      }).unwrap();
      showSuccess("Application added");
      onOpenChange(false);
    } catch (err) {
      showError(`Couldn't create application: ${extractErrorMessage(err)}`);
    }
  };

  const onSubmitNewCompany: SubmitHandler<NewCompanyValues> = async (values) => {
    try {
      const created = await createCompany({
        name: values.name.trim(),
        primary_domain: values.primary_domain.trim() || null,
      }).unwrap();
      showSuccess(`Company "${created.name}" created`);
      setValue("company_id", created.id, { shouldValidate: true });
      setShowNewCompany(false);
      newCompanyForm.reset();
    } catch (err) {
      showError(`Couldn't create company: ${extractErrorMessage(err)}`);
    }
  };

  const companies = companiesData?.items ?? [];
  const hasCompanies = companies.length > 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium mb-1">
                Company <span className="text-destructive">*</span>
              </label>
              {showNewCompany ? (
                <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground">New company</p>
                  <div>
                    <label className="block text-xs font-medium mb-1">Name</label>
                    <input
                      type="text"
                      {...newCompanyForm.register("name", { required: true, minLength: 1 })}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      placeholder="e.g. Acme Corp"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Domain (optional)</label>
                    <input
                      type="text"
                      {...newCompanyForm.register("primary_domain")}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                      placeholder="acme.com"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowNewCompany(false)}
                      className="px-3 py-1.5 text-xs border rounded-md hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <LoadingButton
                      type="button"
                      size="sm"
                      isLoading={creatingCompany}
                      loadingText="Creating..."
                      onClick={newCompanyForm.handleSubmit(onSubmitNewCompany)}
                    >
                      Create company
                    </LoadingButton>
                  </div>
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
                    className="inline-flex items-center gap-1 px-3 py-2 text-sm border rounded-md hover:bg-muted whitespace-nowrap"
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
