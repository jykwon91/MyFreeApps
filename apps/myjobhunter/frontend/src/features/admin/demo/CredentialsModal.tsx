import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Check, Copy } from "lucide-react";
import type { DemoCredentials } from "@/types/demo/demo-credentials";

interface CredentialsModalProps {
  open: boolean;
  credentials: DemoCredentials;
  onClose: () => void;
}

const COPY_FEEDBACK_MS = 2000;

/**
 * One-time view of a freshly-created demo account's credentials.
 *
 * The backend never re-shows the plaintext password — if the operator
 * dismisses this modal without copying, the only recovery is to
 * delete + recreate. The component surfaces a clear warning and a
 * single "copy" button to make the safe path obvious.
 */
export default function CredentialsModal({
  open,
  credentials,
  onClose,
}: CredentialsModalProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  async function handleCopyAll() {
    const text = `Email: ${credentials.email}\nPassword: ${credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      timerRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // Clipboard API unavailable (e.g. http://localhost in Firefox without
      // the dom.events.asyncClipboard pref). Fall back to selecting the
      // password text so the user can Ctrl+C manually.
      const el = document.querySelector("[data-credential-password]");
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[70]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
          <Dialog.Title className="text-base font-semibold">
            Demo credentials
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mt-1">
            Save these credentials now — the password won't be shown again.
          </Dialog.Description>

          <div className="mt-4 space-y-3">
            <div className="bg-muted rounded-md px-4 py-3">
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="text-sm font-mono break-all">
                {credentials.email}
              </p>
            </div>
            <div className="bg-muted rounded-md px-4 py-3">
              <p className="text-xs text-muted-foreground">Password</p>
              <p
                className="text-sm font-mono break-all"
                data-credential-password
              >
                {credentials.password}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2 dark:bg-yellow-950 dark:border-yellow-800">
            <AlertTriangle
              size={16}
              className="text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5"
            />
            <p className="text-xs text-yellow-800 dark:text-yellow-200">
              The password is only shown here. If you dismiss this modal
              without copying, you'll need to delete and recreate the demo
              account to get new credentials.
            </p>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-muted transition-colors min-h-[36px]"
            >
              Close
            </button>
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
