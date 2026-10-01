import Button from "../components/ui/Button";
import type { DiscordActivityError } from "./errors/DiscordActivityError";
import type { DiscordActivityErrorReason } from "./types/DiscordActivityErrorReason";

export interface DiscordActivityConnectFailedProps {
  error: DiscordActivityError | null;
  onRetry: () => void;
  onContinue: () => void;
}

const REASON_COPY: Record<DiscordActivityErrorReason, string> = {
  "ready-timeout": "Discord didn't respond. Check your connection and try again.",
  "closed-by-discord": "Discord closed the connection. Try again in a moment.",
  "client-id-unavailable": "The app couldn't reach its server. Check your connection and try again.",
  "sdk-load-failed": "Part of the app didn't load. Check your connection and try again.",
  "sdk-init-failed": "Discord started the activity in a way this app doesn't understand. Try again.",
  "not-in-discord": "This page wasn't opened from Discord.",
};

const FALLBACK_COPY = "Something went wrong while connecting. Try again.";

/**
 * Shown when the Discord handshake fails or times out. "Try again" restarts
 * the connection; "Continue anyway" opens the app without it — browsing
 * works, but links can't leave Discord until it connects.
 */
export default function DiscordActivityConnectFailed({ error, onRetry, onContinue }: DiscordActivityConnectFailedProps) {
  const copy = error === null ? FALLBACK_COPY : REASON_COPY[error.reason];
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground" role="alert">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-semibold">Couldn&apos;t connect to Discord</h1>
        <p className="text-sm text-muted-foreground">{copy}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onRetry}>Try again</Button>
          <Button variant="secondary" onClick={onContinue}>
            Continue anyway
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Without the connection you can still browse, but links can&apos;t open outside Discord.
        </p>
      </div>
    </div>
  );
}
