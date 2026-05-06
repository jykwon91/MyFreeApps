import { useState } from "react";
import {
  LoadingButton,
  extractErrorMessage,
  showError,
  showSuccess,
} from "@platform/ui";
import { useCreateInviteMutation } from "@/store/invitesApi";

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
 * the admin can correct the address.
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
      showError(`Couldn't send invite: ${extractErrorMessage(err)}`);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-invite-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={handleClose}
    >
      <div
        className="bg-background border rounded-xl shadow-lg w-full max-w-md mx-4 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="create-invite-title" className="text-lg font-semibold">
          Invite someone to MyJobHunter
        </h2>
        <p className="text-sm text-muted-foreground">
          They'll receive an email with a one-time link to register. The link
          expires in 7 days.
        </p>

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
      </div>
    </div>
  );
}
