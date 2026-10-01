import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DiscordActivityError } from "./errors/DiscordActivityError";
import type { DiscordActivityState } from "./types/DiscordActivityState";
import type { DiscordActivityStatus } from "./types/DiscordActivityStatus";
import type { DiscordUrlMapping } from "./types/DiscordUrlMapping";
import { DiscordActivityContext } from "./DiscordActivityContext";
import { bootDiscordActivity } from "./bootDiscordActivity";
import { toDiscordActivityError } from "./errors/toDiscordActivityError";
import { isDiscordActivity } from "./launchParams";

export interface DiscordActivityProviderProps {
  /**
   * Resolves the Discord application (client) id — e.g. from the app's public
   * config endpoint. Called only inside Discord. Pass a stable function.
   */
  loadClientId: () => Promise<string>;
  /** The Developer Portal URL Mappings, as data. Pass a stable array. */
  urlMappings: readonly DiscordUrlMapping[];
  /** Override the READY timeout (tests). */
  readyTimeoutMs?: number;
  /** What "Try again" does — defaults to reloading the page. */
  reload?: () => void;
  children: ReactNode;
}

interface Connection {
  status: DiscordActivityStatus;
  error: DiscordActivityError | null;
}

const CONNECTING: Connection = { status: "loading", error: null };
const CONNECTED: Connection = { status: "ready", error: null };

function reloadPage(): void {
  window.location.reload();
}

/**
 * Connects to Discord when the app runs as an Activity and shares the
 * progress via `useDiscordActivity()`. Outside Discord it does nothing — no
 * SDK download, status `"ready"` from the first render.
 */
export default function DiscordActivityProvider({
  loadClientId,
  urlMappings,
  readyTimeoutMs,
  reload = reloadPage,
  children,
}: DiscordActivityProviderProps) {
  const [inside] = useState(isDiscordActivity);
  const [connection, setConnection] = useState<Connection>(inside ? CONNECTING : CONNECTED);

  useEffect(() => {
    if (!inside) return;
    let mounted = true;
    bootDiscordActivity({ loadClientId, urlMappings, readyTimeoutMs }).then(
      () => {
        if (mounted) setConnection(CONNECTED);
      },
      (error: unknown) => {
        if (mounted) setConnection({ status: "error", error: toDiscordActivityError(error) });
      },
    );
    return () => {
      mounted = false;
    };
  }, [inside, loadClientId, urlMappings, readyTimeoutMs]);

  const value = useMemo<DiscordActivityState>(
    () => ({ inside, status: connection.status, error: connection.error, retry: reload }),
    [inside, connection, reload],
  );

  return <DiscordActivityContext.Provider value={value}>{children}</DiscordActivityContext.Provider>;
}
