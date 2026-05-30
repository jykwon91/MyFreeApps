import { useState } from "react";
import { AlertCircle, CheckCircle, Info, X } from "lucide-react";
import Panel from "@/shared/components/ui/Panel";
import FormField from "@/shared/components/ui/FormField";
import { LoadingButton } from "@platform/ui";
import { showError } from "@/shared/lib/toast-store";
import { EMAIL_REGEX } from "@/shared/lib/welcome-manual-constants";
import { useEmailWelcomeManualMutation } from "@/shared/store/welcomeManualsApi";
import type { WelcomeManualEmailDialogStep } from "@/shared/types/welcome-manual/welcome-manual-email-dialog-step";

export interface WelcomeManualEmailDialogProps {
  manualId: string;
  onClose: () => void;
}

export default function WelcomeManualEmailDialog({ manualId, onClose }: WelcomeManualEmailDialogProps) {
  const [emailManual, { isLoading }] = useEmailWelcomeManualMutation();
  const [step, setStep] = useState<WelcomeManualEmailDialogStep>("form");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [errorReason, setErrorReason] = useState<string | null>(null);

  const emailValid = EMAIL_REGEX.test(email.trim());

  async function handleSend() {
    if (!emailValid) return;
    try {
      const send = await emailManual({
        manualId,
        data: { recipient_email: email.trim(), recipient_name: name.trim() || null },
      }).unwrap();
      setErrorReason(send.error_reason);
      setStep(send.status);
    } catch {
      // A non-200 (e.g. 404 manual not found) — the send-record path returns
      // 200 even for failed/skipped, so this only fires on transport errors.
      showError("I couldn't send that. Want to try again?");
    }
  }

  function handleTryAgain() {
    // Keep the email pre-filled so the host doesn't retype it.
    setErrorReason(null);
    setStep("form");
  }

  return (
    <Panel position="center" width="28rem" onClose={onClose}>
      <div className="flex flex-col flex-1 overflow-hidden" data-testid="welcome-manual-email-dialog">
        <div className="px-5 py-4 border-b flex items-start justify-between">
          <h3 className="font-medium text-base">Email this guide to a guest</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Close dialog"
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === "form" ? (
            <div className="space-y-4" data-testid="welcome-manual-email-form">
              <FormField label="Guest email address" required>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="guest@example.com"
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  data-testid="welcome-manual-email-input"
                />
              </FormField>
              <FormField label="Guest name (optional)">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex"
                  className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                  data-testid="welcome-manual-email-name"
                />
              </FormField>
            </div>
          ) : null}

          {step === "sent" ? (
            <div className="text-center space-y-3 py-4" data-testid="welcome-manual-email-sent">
              <CheckCircle className="h-10 w-10 text-green-600 mx-auto" aria-hidden="true" />
              <p className="font-medium">Guide sent!</p>
              <p className="text-sm text-muted-foreground">
                I sent the guide to {email.trim()}. It should arrive shortly.
              </p>
            </div>
          ) : null}

          {step === "failed" ? (
            <div className="text-center space-y-3 py-4" data-testid="welcome-manual-email-failed">
              <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" aria-hidden="true" />
              <p className="font-medium">I couldn't send that</p>
              <p className="text-sm text-muted-foreground">
                {errorReason
                  ? errorReason
                  : "Something went wrong on the way out. You can try again."}
              </p>
            </div>
          ) : null}

          {step === "skipped" ? (
            <div className="text-center space-y-3 py-4" data-testid="welcome-manual-email-skipped">
              <Info className="h-10 w-10 text-blue-600 mx-auto" aria-hidden="true" />
              <p className="font-medium">Email isn't set up yet</p>
              <p className="text-sm text-muted-foreground">
                Sending email isn't configured on this deployment yet, so I couldn't
                send the guide. Once it's set up, this will work automatically.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t">
          {step === "form" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-muted-foreground hover:text-foreground min-h-[44px] px-3"
              >
                Cancel
              </button>
              <LoadingButton
                type="button"
                onClick={() => void handleSend()}
                isLoading={isLoading}
                loadingText="Sending..."
                disabled={!emailValid}
                data-testid="welcome-manual-email-send"
              >
                Send guide
              </LoadingButton>
            </>
          ) : null}

          {step === "sent" ? (
            <LoadingButton
              type="button"
              isLoading={false}
              onClick={onClose}
              data-testid="welcome-manual-email-done"
            >
              Done
            </LoadingButton>
          ) : null}

          {step === "failed" ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-muted-foreground hover:text-foreground min-h-[44px] px-3"
              >
                Close
              </button>
              <LoadingButton
                type="button"
                isLoading={false}
                onClick={handleTryAgain}
                data-testid="welcome-manual-email-try-again"
              >
                Try again
              </LoadingButton>
            </>
          ) : null}

          {step === "skipped" ? (
            <LoadingButton
              type="button"
              isLoading={false}
              variant="secondary"
              onClick={onClose}
              data-testid="welcome-manual-email-close"
            >
              Close
            </LoadingButton>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
