import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  LoadingButton,
  ModalDialog,
  showError,
  showSuccess,
} from "@platform/ui";
import { useCreateInviteMutation } from "@myjobhunter/api-client/store/invitesApi";
import {
  extractInviteCreateErrorMessage,
  isInviteEmailUnconfirmed,
} from "./inviteErrorMessages";

export interface CreateInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal dialog the admin uses to issue a new invite.
 *
 * Single email input + submit. On success, shows a toast, resets the
 * form, and closes. Server-side errors (already registered, already
 * pending) are surfaced inline via toast — the dialog stays open so
 * the admin can correct the address. When the email's delivery is
 * unconfirmed the invite was kept, so the dialog closes and the admin works
 * from the list (cancel and resend). Escape and a click on the backdrop
 * close it, like Cancel.
 */
export default function CreateInviteDialog({
  open,
  onOpenChange,
}: CreateInviteDialogProps) {
  const [email, setEmail] = useState("");
  const [createInvite, { isLoading }] = useCreateInviteMutation();

  if (!open) return null;

  function handleClose() {
    setEmail("");
    onOpenChange(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      showError("Please enter an email address");
      return;
    }
    try {
      await createInvite({ email: trimmed }).unwrap();
      showSuccess(`Invite sent to ${trimmed}`);
      setEmail("");
      onOpenChange(false);
    } catch (err) {
      showError(extractInviteCreateErrorMessage(err));
      if (isInviteEmailUnconfirmed(err)) {
        // The invite exists now; resending the same address would only 409.
        handleClose();
      }
    }
  }

  return (
    <ModalDialog
      testId="create-invite-dialog"
      onClose={handleClose}
      closeOnBackdropClick
      hasDescription
      panelClassName="bg-background border rounded-xl shadow-lg w-full max-w-md p-6 space-y-4"
    >
      <Dialog.Title className="text-lg font-semibold">
        Invite someone to MyJobHunter
      </Dialog.Title>
      <Dialog.Description className="text-sm text-muted-foreground">
        They'll receive an email with a one-time link to register. The link
        expires in 7 days.
      </Dialog.Description>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="invite-email"
            className="block text-sm font-medium mb-1"
          >
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            autoFocus
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 min-h-[44px]"
            placeholder="recipient@example.com"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm rounded-md hover:bg-muted disabled:opacity-50 min-h-[44px]"
          >
            Cancel
          </button>
          <LoadingButton
            type="submit"
            isLoading={isLoading}
            loadingText="Sending..."
            disabled={isLoading || !email.trim()}
          >
            Send invite
          </LoadingButton>
        </div>
      </form>
    </ModalDialog>
  );
}
