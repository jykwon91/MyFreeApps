import { useState } from "react";
import { format } from "date-fns";
import { NUMBER_INPUT_DECIMAL_SEPARATOR } from "@platform/ui/constants/number-input-decimal-separator";
import { Button, ConfirmDialog, LoadingButton, showError, showSuccess } from "@platform/ui";
import {
  useDeleteFinancialAccountMutation,
  useRestoreFinancialAccountMutation,
  useUpdateFinancialAccountMutation,
} from "@mybookkeeper/api-client/store/financialAccountsApi";
import type { FinancialAccount } from "@mybookkeeper/api-client/types/financial-account/financial-account";
import { financialAccountToFormValues, toFinancialAccountPayload } from "@mybookkeeper/api-client/utils/financialAccountForm";
import { rejectedWriteDetail } from "@mybookkeeper/api-client/utils/rejectedWriteDetail";
import FormDialogShell from "@/shared/components/ui/FormDialogShell";
import { FINANCIAL_ACCOUNT_MESSAGES as MSG } from "@/shared/lib/financial-account-messages";
import FinancialAccountDialogActions from "./FinancialAccountDialogActions";
import FinancialAccountFormFields from "./FinancialAccountFormFields";
import { useFinancialAccountForm } from "./useFinancialAccountForm";

export interface EditFinancialAccountDialogProps {
  account: FinancialAccount;
  onClose: () => void;
}

/** Edit every field, close or reopen the account, or delete it with an Undo. */
export default function EditFinancialAccountDialog({ account, onClose }: EditFinancialAccountDialogProps) {
  const [updateAccount, { isLoading: isSaving }] = useUpdateFinancialAccountMutation();
  const [deleteAccount, { isLoading: isDeleting }] = useDeleteFinancialAccountMutation();
  const [restoreAccount] = useRestoreFinancialAccountMutation();
  const [isTogglingClosed, setIsTogglingClosed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const form = useFinancialAccountForm(financialAccountToFormValues(account));
  const isClosed = account.closed_on !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.passes()) return;
    try {
      await updateAccount({
        accountId: account.id,
        data: toFinancialAccountPayload(form.values, NUMBER_INPUT_DECIMAL_SEPARATOR),
      }).unwrap();
      showSuccess(MSG.saved);
      onClose();
    } catch (err) {
      showError(rejectedWriteDetail(err, MSG.saveFailed));
    }
  }

  async function handleToggleClosed() {
    setIsTogglingClosed(true);
    try {
      await updateAccount({
        accountId: account.id,
        data: { closed_on: isClosed ? null : format(new Date(), "yyyy-MM-dd") },
      }).unwrap();
      showSuccess(isClosed ? MSG.reopenedToast : MSG.closedToast);
      onClose();
    } catch (err) {
      showError(rejectedWriteDetail(err, MSG.saveFailed));
    } finally {
      setIsTogglingClosed(false);
    }
  }

  async function handleDelete() {
    try {
      await deleteAccount(account.id).unwrap();
      onClose();
      showSuccess(MSG.deleted, {
        label: MSG.undo,
        pendingLabel: "Restoring...",
        altText: MSG.undoAltText,
        onClick: async () => {
          try {
            await restoreAccount(account.id).unwrap();
          } catch (err) {
            showError(rejectedWriteDetail(err, MSG.restoreFailed));
          }
        },
      });
    } catch (err) {
      showError(rejectedWriteDetail(err, MSG.deleteFailed));
    }
  }

  return (
    <FormDialogShell title={MSG.editTitle} testId="edit-financial-account-dialog" onClose={onClose} width="wide">
      <form noValidate onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
        <FinancialAccountFormFields values={form.values} onChange={form.setField} problems={form.problems} />
        <FinancialAccountDialogActions onCancel={onClose} isSaving={isSaving && !isTogglingClosed} saveLabel="Save changes">
          <LoadingButton
            type="button"
            variant="secondary"
            size="md"
            isLoading={isTogglingClosed}
            loadingText={isClosed ? "Reopening..." : "Closing..."}
            onClick={() => void handleToggleClosed()}
            data-testid="financial-account-toggle-closed-button"
          >
            {isClosed ? MSG.reopenAccount : MSG.closeAccount}
          </LoadingButton>
          <Button
            type="button"
            variant="destructive"
            size="md"
            onClick={() => setConfirmingDelete(true)}
            className="min-h-[44px]"
            data-testid="financial-account-delete-button"
          >
            {MSG.deleteAccount}
          </Button>
        </FinancialAccountDialogActions>
      </form>
      <ConfirmDialog
        open={confirmingDelete}
        title={MSG.deleteTitle}
        description={MSG.deleteDescription}
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </FormDialogShell>
  );
}
