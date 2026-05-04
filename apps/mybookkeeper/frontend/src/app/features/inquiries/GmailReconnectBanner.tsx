import { Link } from "react-router-dom";
import AlertBox from "@/shared/components/ui/AlertBox";

interface Props {
  reason: "missing-integration" | "missing-send-scope" | "reauth-required";
}

/**
 * Banner shown inside the reply panel when the host can't send through
 * Gmail. Three cases:
 *   - missing-integration: no Gmail OAuth at all yet
 *   - missing-send-scope:  connected pre-PR-2.3 (only readonly scope)
 *   - reauth-required:     refresh token expired or revoked by Google
 *
 * All cases link to Integrations where the host can connect or reconnect.
 */
export default function GmailReconnectBanner({ reason }: Props) {
  const message =
    reason === "missing-integration"
      ? "Connect Gmail to send replies. Your existing data stays untouched."
      : reason === "reauth-required"
        ? "Gmail connection expired. Reconnect Gmail in Settings → Integrations to send replies."
        : "Reply via Gmail needs send permission. Reconnect Gmail to grant it — your existing access is preserved.";

  return (
    <div data-testid="gmail-reconnect-banner">
      <AlertBox variant="warning">
        <div className="space-y-2">
          <p className="text-sm">{message}</p>
          <Link
            to="/integrations"
            className="inline-block text-sm font-medium underline"
            data-testid="gmail-reconnect-link"
          >
            Go to integrations
          </Link>
        </div>
      </AlertBox>
    </div>
  );
}
