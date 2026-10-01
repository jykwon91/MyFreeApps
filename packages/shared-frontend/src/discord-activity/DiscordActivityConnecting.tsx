import Spinner from "../components/icons/Spinner";

/** Full-screen "Connecting to Discord…" shown during the SDK handshake (usually under a second). */
export default function DiscordActivityConnecting() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div role="status" aria-live="polite" className="flex items-center gap-3 text-sm text-muted-foreground">
        <Spinner className="h-5 w-5" />
        <span>Connecting to Discord…</span>
      </div>
    </div>
  );
}
