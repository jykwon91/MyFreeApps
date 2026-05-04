import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useGetIntegrationsQuery } from "@/shared/store/integrationsApi";

/**
 * Persistent sidebar warning shown when the user's Gmail refresh token has
 * been rejected by Google. Renders above the nav and links to /integrations
 * where the "Reconnect" button lives.
 *
 * Stays hidden until the integrations query resolves to avoid flash-of-banner
 * on load.
 */
export default function GmailReauthSidebarBanner() {
  const { data: integrations = [], isLoading } = useGetIntegrationsQuery();

  if (isLoading) return null;

  const gmail = integrations.find((i) => i.provider === "gmail");
  if (!gmail?.needs_reauth) return null;

  return (
    <div
      className="mx-3 mb-1 rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 px-3 py-2"
      data-testid="gmail-reauth-sidebar-banner"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          size={14}
          className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-200 leading-snug">
            Gmail reconnection needed
          </p>
          <Link
            to="/integrations"
            className="text-xs text-amber-700 dark:text-amber-300 underline hover:no-underline min-h-[44px] inline-flex items-center"
            data-testid="gmail-reauth-sidebar-banner-link"
          >
            Reconnect now
          </Link>
        </div>
      </div>
    </div>
  );
}
