import { useState, type ReactNode } from "react";
import DiscordActivityConnectFailed from "./DiscordActivityConnectFailed";
import DiscordActivityConnecting from "./DiscordActivityConnecting";
import { useDiscordActivity } from "./useDiscordActivity";

export interface DiscordActivityGateProps {
  children: ReactNode;
}

/**
 * Holds the app back while a Discord Activity connects: "Connecting to
 * Discord…" during the handshake, then the app — or, if the connection
 * fails, a screen offering "Try again" / "Continue anyway". Outside Discord
 * it renders `children` straight away.
 */
export default function DiscordActivityGate({ children }: DiscordActivityGateProps) {
  const { inside, status, error, retry } = useDiscordActivity();
  const [continued, setContinued] = useState(false);

  if (!inside || status === "ready" || continued) return <>{children}</>;
  if (status === "loading") return <DiscordActivityConnecting />;
  return <DiscordActivityConnectFailed error={error} onRetry={retry} onContinue={() => setContinued(true)} />;
}
