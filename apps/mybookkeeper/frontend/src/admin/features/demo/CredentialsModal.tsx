import { useState, useEffect, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, Copy, AlertTriangle } from "lucide-react";
import Button from "@/shared/components/ui/Button";

export interface CredentialsModalProps {
  open: boolean;
  email: string;
  password: string;
  onClose: () => void;
}

export default function CredentialsModal({ open, email, password, onClose }: CredentialsModalProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  async function handleCopyAll() {
    const text = `Email: ${email}\nPassword: ${password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the password text so user can Ctrl+C
      const el = document.querySelector("[data-credential-password]");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">
            Demo Credentials
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Save these credentials now.
          </Dialog.Description>

          <div className="mt-4 space-y-3">
            <div className="bg-muted rounded-md px-4 py-3">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-mono break-all">{email}</p>
            </div>
            <div className="bg-muted rounded-md px-4 py-3">
              <p className="text-xs text-muted-foreground">Password</p>
              <p className="text-sm font-mono break-all" data-credential-password>{password}</p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 dark:bg-yellow-950 dark:border-yellow-800">
            <AlertTriangle size={16} className="text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              Save these credentials — the password won't be shown again.
            </p>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
            <button
              onClick={handleCopyAll}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity min-h-[36px]"
            >
              {copied ? (
                <>
                  <Check size={14} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy credentials
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
