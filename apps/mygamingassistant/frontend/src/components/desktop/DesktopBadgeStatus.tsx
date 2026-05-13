/**
 * DesktopBadgeStatus — inner status text rendered by DesktopBadge.
 *
 * Extracted to its own file with early returns to avoid a nested ternary
 * in DesktopBadge's JSX. Three states: error / loaded / loading.
 */
import type { AppVersion } from "@/types/desktop";

interface DesktopBadgeStatusProps {
  version: AppVersion | null;
  error: string | null;
}

export default function DesktopBadgeStatus({
  version,
  error,
}: DesktopBadgeStatusProps) {
  if (error) {
    return <span className="text-destructive">IPC error: {error}</span>;
  }
  if (version) {
    return (
      <>
        <span className="font-medium">v{version.version}</span>
        <span className="text-muted-foreground"> · {version.build}</span>
        <span className="text-muted-foreground"> · PR {version.pr}</span>
      </>
    );
  }
  return <span className="text-muted-foreground">Loading...</span>;
}
