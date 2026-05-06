import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LoadingButton } from "@platform/ui";

export interface CreateDemoDialogProps {
  open: boolean;
  isLoading: boolean;
  onSubmit: (input: { email?: string; displayName?: string }) => void;
  onCancel: () => void;
}

/**
 * Modal for creating a new demo account.
 *
 * Both inputs (email + display name) are optional — the backend
 * generates sensible defaults when omitted (`demo+<uuid>@myjobhunter.local`
 * and `Alex Demo` respectively). The form is intentionally minimal
 * because the seeded data does the heavy lifting.
 *
 * The form's local state (email + displayName) resets imperatively
 * inside the cancel handler rather than via a useEffect on `open` —
 * the React docs recommend NOT setting state synchronously in an
 * effect body when a handler is available, so cancel is the seam.
 */
export default function CreateDemoDialog({
  open,
  isLoading,
  onSubmit,
  onCancel,
}: CreateDemoDialogProps) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");

  function resetForm() {
    setEmail("");
    setDisplayName("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedName = displayName.trim();
    // Optimistically clear so a re-open after success starts fresh.
    // The parent owns the open/close state via `open`, so this is
    // safe — we're not calling onCancel from here.
    resetForm();
    onSubmit({
      email: trimmedEmail || undefined,
      displayName: trimmedName || undefined,
    });
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      resetForm();
      onCancel();
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-sm rounded-lg border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">
            Create demo account
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            A fully-seeded sandbox account for showing MyJobHunter to a
            stranger.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="demo-email"
                className="block text-sm font-medium mb-1"
              >
                Email
              </label>
              <input
                id="demo-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="demo+<id>@myjobhunter.local (auto-generated)"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave blank to auto-generate.
              </p>
            </div>

            <div>
              <label
                htmlFor="demo-display-name"
                className="block text-sm font-medium mb-1"
              >
                Display name
              </label>
              <input
                id="demo-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Alex Demo"
                maxLength={100}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isLoading}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleOpenChange(false)}
                className="px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-muted transition-colors min-h-[36px]"
                disabled={isLoading}
              >
                Cancel
              </button>
              <LoadingButton
                type="submit"
                isLoading={isLoading}
                loadingText="Creating..."
              >
                Create
              </LoadingButton>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
