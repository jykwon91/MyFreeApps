import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Button from "@/shared/components/ui/Button";
import LoadingButton from "@/shared/components/ui/LoadingButton";

interface Props {
  open: boolean;
  isLoading: boolean;
  onSubmit: (tag: string, recipientEmail?: string) => void;
  onCancel: () => void;
}

export default function CreateDemoDialog({ open, isLoading, onSubmit, onCancel }: Props) {
  const [tag, setTag] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");

  useEffect(() => {
    if (open) {
      setTag("");
      setRecipientEmail("");
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = tag.trim();
    if (!trimmed) return;
    const email = recipientEmail.trim() || undefined;
    onSubmit(trimmed, email);
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setTag("");
      setRecipientEmail("");
      onCancel();
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-sm rounded-lg border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">
            Create Demo User
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Create a demo account with sample data for someone to explore.
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="demo-tag" className="block text-sm font-medium mb-1">
                Display Name
              </label>
              <input
                id="demo-tag"
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="e.g. John Smith, Conference Booth"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoFocus
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="demo-email" className="block text-sm font-medium mb-1">
                Send invite to
              </label>
              <input
                id="demo-email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional — leave blank to show credentials in the dialog instead.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" type="button" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <LoadingButton
                type="submit"
                size="sm"
                isLoading={isLoading}
                loadingText="Creating..."
                disabled={!tag.trim()}
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
