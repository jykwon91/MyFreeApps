import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { LoadingButton } from "@platform/ui";
import { buildSiteUrl, openExternal } from "@platform/ui/discord-activity";
import { MGA_SITE_URL } from "@/constants/discordActivity";

interface OpenInBrowserButtonProps {
  variant?: "primary" | "secondary";
}

/**
 * Opens the page you're on at the real website — the way out of the Discord
 * Activity for everything it can't do (signing in, adding lineups, reading
 * screenshots). Discord shows its "leaving Discord" prompt; the button stays
 * busy until Discord answers, so a second click can't stack another prompt.
 */
export default function OpenInBrowserButton({ variant = "secondary" }: OpenInBrowserButtonProps) {
  const location = useLocation();
  const [opening, setOpening] = useState(false);

  async function open(): Promise<void> {
    setOpening(true);
    try {
      await openExternal(buildSiteUrl(MGA_SITE_URL, location));
    } finally {
      setOpening(false);
    }
  }

  return (
    <LoadingButton size="sm" variant={variant} isLoading={opening} loadingText="Opening…" onClick={() => void open()}>
      <span className="flex items-center gap-1.5">
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        Open in browser
      </span>
    </LoadingButton>
  );
}
