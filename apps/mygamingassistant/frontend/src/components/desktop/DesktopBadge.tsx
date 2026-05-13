/**
 * DesktopBadge — tiny status row shown on the Settings page when the SPA is
 * running inside the Tauri desktop binary.
 *
 * This is the PR 7 smoke test for the Tauri IPC bridge. Renders nothing in
 * the web build. In the desktop build, it calls the `get_app_version`
 * Tauri command and displays the returned version + build profile.
 *
 * Why on Settings: low-traffic page, doesn't clutter the main UI, but is
 * easy to find when verifying a desktop build was wired correctly.
 * Future PRs will surface live-mode controls in their own dedicated areas
 * (not here).
 */
import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { Card } from "@platform/ui";
import { invokeTauri, isTauri } from "@/lib/tauri";
import type { AppVersion } from "@/types/desktop";
import DesktopBadgeStatus from "@/components/desktop/DesktopBadgeStatus";

export default function DesktopBadge() {
  // Capture the runtime check once at mount so we don't recompute every
  // render (Tauri's injection happens before module evaluation).
  const [inTauri] = useState(() => isTauri());

  const [version, setVersion] = useState<AppVersion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!inTauri) return;
    let cancelled = false;
    invokeTauri<AppVersion>("get_app_version")
      .then((result) => {
        if (!cancelled) setVersion(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inTauri]);

  // Web build: render nothing (no platform context to surface).
  if (!inTauri) return null;

  return (
    <Card title="Desktop build">
      <div className="flex items-center gap-3">
        <Monitor className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
        <div className="text-sm">
          <DesktopBadgeStatus version={version} error={error} />
        </div>
      </div>
    </Card>
  );
}
