import { useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useForm, type SubmitHandler } from "react-hook-form";
import { LoadingButton, showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import { useCreateCompanyMutation } from "@/lib/companiesApi";
import type { Company } from "@/types/company";

interface FormValues {
  name: string;
  primary_domain: string;
  industry: string;
  hq_location: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Optional callback fired after a successful create. Useful for e.g.
   * `AddApplicationDialog` to capture the new company id and pre-select
   * it without re-opening the dialog. The standalone Companies page
   * doesn't need this — the cache invalidation handles list refresh.
   */
  onCreated?: (company: Company) => void;
}

export default function AddCompanyDialog({ open, onOpenChange, onCreated }: Props) {
  const [createCompany, { isLoading }] = useCreateCompanyMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    defaultValues: { name: "", primary_domain: "", industry: "", hq_location: "" },
  });

  // Reset on close so re-open starts fresh.
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    try {
      const created = await createCompany({
        name: values.name.trim(),
        primary_domain: values.primary_domain.trim() || null,
        industry: values.industry.trim() || null,
        hq_location: values.hq_location.trim() || null,
      }).unwrap();
      showSuccess(`Company "${created.name}" added`);
      onCreated?.(created);
      onOpenChange(false);
    } catch (err) {
      showError(`Couldn't create company: ${extractErrorMessage(err)}`);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md max-h-[90vh] overflow-y-auto bg-card border rounded-lg shadow-lg z-50 p-6">
          <div className="flex items-center justify-between mb-4">
            <Dialog.Title className="text-lg font-semibold">Add company</Dialog.Title>
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
              <label htmlFor="ac-name" className="block text-sm font-medium mb-1">
                Name <span className="text-destructive">*</span>
              </label>
              <input
                id="ac-name"
                type="text"
                {...register("name", { required: "Name is required", minLength: 1 })}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                placeholder="e.g. Acme Corp"
                autoFocus
              />
              {errors.name ? (
                <p className="text-xs text-destructive mt-1">{errors.name.message}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="ac-domain" className="block text-sm font-medium mb-1">Domain</label>
              <input
                id="ac-domain"
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
                <label htmlFor="ac-industry" className="block text-sm font-medium mb-1">Industry</label>
                <input
                  id="ac-industry"
                  type="text"
                  {...register("industry")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. SaaS"
                />
              </div>
              <div>
                <label htmlFor="ac-hq" className="block text-sm font-medium mb-1">HQ location</label>
                <input
                  id="ac-hq"
                  type="text"
                  {...register("hq_location")}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  placeholder="e.g. SF, NYC"
                />
              </div>
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
              <LoadingButton type="submit" isLoading={isLoading} loadingText="Adding...">
                Add company
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
