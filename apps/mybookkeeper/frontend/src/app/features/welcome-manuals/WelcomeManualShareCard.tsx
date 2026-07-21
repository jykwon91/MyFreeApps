import { useState } from "react";
import { Copy } from "lucide-react";
import { LoadingButton, ConfirmDialog } from "@platform/ui";
import { showError, showSuccess } from "@/shared/lib/toast-store";
import {
  useEnableWelcomeManualShareMutation,
  useUpdateWelcomeManualShareMutation,
  useRevokeWelcomeManualShareMutation,
} from "@/shared/store/welcomeManualsApi";

export interface WelcomeManualShareCardProps {
  manualId: string;
  shareToken: string | null;
  sharePin: string | null;
}

/**
 * Lets a host create, rotate, or revoke a PIN-protected public share link
 * for a welcome manual (`/guide/:token`). The manual holds Wi-Fi / check-in
 * details, so guests must enter the current PIN before anything renders.
 */
export default function WelcomeManualShareCard({
  manualId,
  shareToken,
  sharePin,
}: WelcomeManualShareCardProps) {
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [enableShare, { isLoading: isEnabling }] = useEnableWelcomeManualShareMutation();
  const [updateShare, { isLoading: isRegenerating }] = useUpdateWelcomeManualShareMutation();
  const [revokeShare, { isLoading: isRevoking }] = useRevokeWelcomeManualShareMutation();

  const shareUrl = shareToken ? `${window.location.origin}/guide/${shareToken}` : null;

  async function copyToClipboard(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(`${label} copied to clipboard.`);
    } catch {
      showError(`Couldn't copy — try selecting the ${label.toLowerCase()} manually.`);
    }
  }

  async function handleEnable() {
    try {
      await enableShare(manualId).unwrap();
      showSuccess("Share link created.");
    } catch {
      showError("I couldn't create a share link. Want to try again?");
    }
  }

  async function handleRegenerate() {
    try {
      const result = await updateShare({ manualId, data: {} }).unwrap();
      showSuccess(`New code: ${result.share_pin}`);
    } catch {
      showError("I couldn't regenerate the code. Want to try again?");
    }
  }

  async function handleRevoke() {
    try {
      await revokeShare(manualId).unwrap();
      showSuccess("Share link revoked.");
      setShowRevokeConfirm(false);
    } catch {
      showError("I couldn't revoke the link. Want to try again?");
    }
  }

  return (
    <section
      className="border rounded-lg p-4 bg-card space-y-3"
      data-testid="welcome-manual-share-card"
    >
      <h2 className="text-sm font-medium">Share link</h2>

      {!shareToken ? (
        <>
          <p className="text-xs text-muted-foreground">
            Create a PIN-protected link guests can open without an account.
          </p>
          <LoadingButton
            variant="secondary"
            size="sm"
            isLoading={isEnabling}
            loadingText="Creating..."
            onClick={() => void handleEnable()}
            data-testid="create-share-link-button"
          >
            Create share link
          </LoadingButton>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Give guests the link + this code. Rotate it per guest below.
          </p>

          <div className="flex items-stretch gap-2 flex-wrap">
            <input
              readOnly
              value={shareUrl ?? ""}
              className="flex-1 min-w-0 border rounded-md px-3 py-2 text-sm bg-muted/40 font-mono"
              aria-label="Share link URL"
              data-testid="share-link-url-input"
            />
            <LoadingButton
              variant="secondary"
              size="sm"
              isLoading={false}
              onClick={() => void copyToClipboard(shareUrl ?? "", "Link")}
              data-testid="copy-share-link-button"
            >
              <Copy className="h-4 w-4 mr-1" aria-hidden="true" />
              Copy link
            </LoadingButton>
          </div>

          <div className="flex items-stretch gap-2 flex-wrap">
            <input
              readOnly
              value={sharePin ?? ""}
              className="flex-1 min-w-0 border rounded-md px-3 py-2 text-sm bg-muted/40 font-mono"
              aria-label="Share access code"
              data-testid="share-pin-input"
            />
            <LoadingButton
              variant="secondary"
              size="sm"
              isLoading={false}
              onClick={() => void copyToClipboard(sharePin ?? "", "Code")}
              data-testid="copy-share-pin-button"
            >
              <Copy className="h-4 w-4 mr-1" aria-hidden="true" />
              Copy code
            </LoadingButton>
          </div>

          <div className="flex gap-2 flex-wrap">
            <LoadingButton
              variant="secondary"
              size="sm"
              isLoading={isRegenerating}
              loadingText="Regenerating..."
              onClick={() => void handleRegenerate()}
              data-testid="regenerate-share-pin-button"
            >
              Regenerate code
            </LoadingButton>
            <LoadingButton
              variant="secondary"
              size="sm"
              isLoading={false}
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setShowRevokeConfirm(true)}
              data-testid="revoke-share-link-button"
            >
              Revoke link
            </LoadingButton>
          </div>

          <ConfirmDialog
            open={showRevokeConfirm}
            title="Revoke this share link?"
            description="Anyone with the current link + code will lose access."
            confirmLabel="Revoke"
            cancelLabel="Cancel"
            variant="danger"
            isLoading={isRevoking}
            onConfirm={handleRevoke}
            onCancel={() => setShowRevokeConfirm(false)}
          />
        </>
      )}
    </section>
  );
}
