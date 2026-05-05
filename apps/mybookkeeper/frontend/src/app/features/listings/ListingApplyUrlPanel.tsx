import { useState } from "react";
import { Copy, Check, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError, showSuccess } from "@/shared/lib/toast-store";

export interface ListingApplyUrlPanelProps {
  slug: string | null;
}

/**
 * Apply URL widget on the operator's Listing detail page.
 *
 * Shows the public ``/apply/<slug>`` URL with a copy button and an optional
 * QR code (collapsed by default — printing a flyer is a less-common use case
 * than copying the URL, so we hide it behind a button to keep the panel
 * compact on small screens).
 */
export default function ListingApplyUrlPanel({ slug }: ListingApplyUrlPanelProps) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  if (!slug) {
    return null;
  }

  const applyUrl = `${window.location.origin}/apply/${slug}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(applyUrl);
      setCopied(true);
      showSuccess("Apply URL copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showError("Couldn't copy — try selecting the URL manually.");
      console.error(err);
    }
  }

  return (
    <section
      className="border rounded-lg p-4 bg-card space-y-3"
      data-testid="listing-apply-url-panel"
    >
      <h2 className="text-sm font-medium">Public inquiry form</h2>
      <p className="text-xs text-muted-foreground">
        Paste this URL into your Airbnb / VRBO / Furnished Finder / Rotating
        Room listing description so prospects can inquire directly into
        MyBookkeeper.
      </p>
      <div className="flex items-stretch gap-2 flex-wrap">
        <input
          readOnly
          value={applyUrl}
          className="flex-1 min-w-0 border rounded-md px-3 py-2 text-sm bg-muted/40 font-mono"
          data-testid="listing-apply-url-input"
          aria-label="Public inquiry form URL"
        />
        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={false}
          onClick={handleCopy}
          data-testid="listing-apply-url-copy"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 mr-1" aria-hidden="true" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-1" aria-hidden="true" />
              Copy
            </>
          )}
        </LoadingButton>
        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={false}
          onClick={() => setShowQr((v) => !v)}
          data-testid="listing-apply-url-qr-toggle"
        >
          <QrCode className="h-4 w-4 mr-1" aria-hidden="true" />
          {showQr ? "Hide QR" : "Show QR"}
        </LoadingButton>
      </div>
      {showQr ? (
        <div
          className="inline-block bg-white p-3 border rounded-md"
          data-testid="listing-apply-url-qr"
        >
          <QRCodeSVG value={applyUrl} size={160} />
        </div>
      ) : null}
    </section>
  );
}
