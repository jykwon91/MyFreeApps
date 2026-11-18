import * as Dialog from "@radix-ui/react-dialog";
import { showSuccess, showError, extractErrorMessage } from "@platform/ui";
import { X } from "lucide-react";
import { LOST_CREATE_CHECK_WHERE } from "@myjobhunter/api-client/constants/lostCreateCheckWhere";
import { useCompanyCreateRecheck } from "@myjobhunter/api-client/hooks/useCompanyCreateRecheck";
import { useCreateCompanyMutation } from "@myjobhunter/api-client/store/companiesApi";
import type { Company } from "@myjobhunter/api-client/types/company";
import { COMPANY_FORM_PROBLEMS } from "@myjobhunter/api-client/constants/companyFormProblems";
import type { CompanyCreateRequest } from "@myjobhunter/api-client/types/company-create-request";
import type { CompanyFormProblems } from "@myjobhunter/api-client/types/company/company-form-problems";
import { isDuplicateCompanyDomainError } from "@myjobhunter/api-client/utils/isDuplicateCompanyDomainError";
import { lostCreateMessage } from "@myjobhunter/api-client/utils/lostCreateMessage";
import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { writeOutcome } from "@platform/core/utils/writeOutcome";
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
  const [createCompany, { isLoading: isCreating }] = useCreateCompanyMutation();
  const { recheck, isChecking } = useCompanyCreateRecheck();

  function added(company: Company): void {
    showSuccess(`Company "${company.name}" added`);
    onCreated?.(company);
    onOpenChange(false);
  }

  // A domain another company already has is said on the domain field, as on the phone.
  const handleSubmit = async (request: CompanyCreateRequest): Promise<CompanyFormProblems | undefined> => {
    let created: Company;
    try {
      created = await createCompany(request).unwrap();
    } catch (err) {
      if (isDuplicateCompanyDomainError(err)) return { primary_domain: COMPANY_FORM_PROBLEMS.duplicateDomain };
      await settle(request.name, err);
      return undefined;
    }
    added(created);
    return undefined;
  };

  /** The server commits before it answers, so after a lost answer a new company with the name is the one sent: it isn't offered twice. */
  async function settle(name: string, err: unknown): Promise<void> {
    if (isCancelledRequest(err)) return;
    const failed = `Couldn't create company: ${extractErrorMessage(err)}`;
    if (writeOutcome(err) !== "unknown") {
      showError(failed);
      return;
    }
    const check = await recheck(name);
    if (check.kind === "created") {
      added(check.item);
      return;
    }
    const message = lostCreateMessage(check, err, { failed, checkWhere: LOST_CREATE_CHECK_WHERE.companies });
    if (message) showError(message);
  }

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
            submitting={isCreating || isChecking}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
