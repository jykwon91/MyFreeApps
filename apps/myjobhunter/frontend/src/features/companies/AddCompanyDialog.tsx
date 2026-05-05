import * as Dialog from "@radix-ui/react-dialog";
import { showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import { useCreateCompanyMutation } from "@/lib/companiesApi";
import type { Company } from "@/types/company";
import type { CompanyCreateRequest } from "@/types/company-create-request";
import CompanyForm from "./CompanyForm";

export interface AddCompanyDialogProps {
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

export default function AddCompanyDialog({ open, onOpenChange, onCreated }: AddCompanyDialogProps) {
  const [createCompany, { isLoading }] = useCreateCompanyMutation();

  const handleSubmit = async (request: CompanyCreateRequest) => {
    try {
      const created = await createCompany(request).unwrap();
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

          {/* key=open ensures the form resets its internal state when
              the dialog re-opens (CompanyForm is mounted fresh each time). */}
          <CompanyForm
            key={String(open)}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            submitLabel="Add company"
            submitting={isLoading}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
