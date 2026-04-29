import { ExternalLink } from "lucide-react";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import { showError } from "@/shared/lib/toast-store";
import { useLazyGetScreeningRedirectQuery } from "@/shared/store/screeningApi";

interface Props {
  applicantId: string;
  /** Override window.open — only used by tests. */
  openWindow?: (url: string) => void;
}

/**
 * "Run KeyCheck" CTA. On click:
 *   1. Fetches the redirect URL from the backend (which writes a
 *      ``screening.redirect_initiated`` audit row).
 *   2. Opens the URL in a new tab with ``noopener,noreferrer`` so the
 *      KeyCheck dashboard cannot reach back into our window via opener.
 *
 * If the host blocks popups, we fall back to a toast prompting them to
 * unblock — never silently fail.
 */
export default function RunScreeningButton({ applicantId, openWindow }: Props) {
  const [trigger, { isFetching }] = useLazyGetScreeningRedirectQuery();

  async function handleClick() {
    try {
      const result = await trigger(applicantId).unwrap();
      const url = result.redirect_url;
      if (openWindow) {
        openWindow(url);
        return;
      }
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) {
        showError(
          "I couldn't open the KeyCheck dashboard — please unblock popups for this site and try again.",
        );
      }
    } catch {
      showError("I couldn't open KeyCheck right now. Please try again in a moment.");
    }
  }

  return (
    <LoadingButton
      data-testid="run-screening-button"
      variant="primary"
      size="sm"
      isLoading={isFetching}
      loadingText="Opening KeyCheck..."
      onClick={handleClick}
    >
      <span className="flex items-center gap-1.5">
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        Run KeyCheck
      </span>
    </LoadingButton>
  );
}
