import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import { extractErrorMessage } from "@/shared/utils/errorMessage";
import { useDeleteAccountMutation } from "@/shared/store/accountApi";
import { useGetTotpStatusQuery } from "@/shared/store/totpApi";
import { logout } from "@/shared/lib/auth";
import { showError } from "@/shared/lib/toast-store";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function DeleteAccountModal({ open, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");

  const { data: totpStatus } = useGetTotpStatusQuery();
  const totpEnabled = totpStatus?.enabled ?? false;

  const [deleteAccount, { isLoading }] = useDeleteAccountMutation();

  async function handleConfirm() {
    try {
      await deleteAccount({
        password,
        confirm_email: email,
        totp_code: totpEnabled ? totpCode : null,
      }).unwrap();
      logout();
    } catch (err: unknown) {
      showError(extractErrorMessage(err));
    }
  }

  function handleClose() {
    if (isLoading) return;
    setEmail("");
    setPassword("");
    setTotpCode("");
    onClose();
  }

  const canSubmit = password.length > 0 && email.trim().length > 0 && (!totpEnabled || totpCode.length >= 6);

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-4">
            <AlertTriangle className="text-red-500 shrink-0" size={20} />
            <Dialog.Title className="text-base font-semibold text-red-600 dark:text-red-400">
              Delete account permanently
            </Dialog.Title>
          </div>
          <Dialog.Description className="text-sm text-muted-foreground mb-5">
            This will immediately and permanently delete your account and all associated data — properties, documents, transactions, and integrations. This cannot be undone.
          </Dialog.Description>

          <div className="space-y-4">
            <div>
              <label htmlFor="delete-confirm-email" className="block text-sm font-medium mb-1">
                Type your email address to confirm
              </label>
              <input
                id="delete-confirm-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label htmlFor="delete-password" className="block text-sm font-medium mb-1">
                Password
              </label>
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Your current password"
              />
            </div>

            {totpEnabled && (
              <div>
                <label htmlFor="delete-totp" className="block text-sm font-medium mb-1">
                  Two-factor authentication code
                </label>
                <input
                  id="delete-totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\s/g, ""))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="6-digit code or recovery code"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <button
              onClick={handleConfirm}
              disabled={!canSubmit || isLoading}
              className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors disabled:opacity-50 bg-red-600 text-white hover:bg-red-700"
            >
              {isLoading ? "Deleting..." : "Delete forever"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
