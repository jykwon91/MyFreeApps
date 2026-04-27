export interface Integration {
  provider: string;
  connected: boolean;
  last_synced_at: string | null;
  metadata: Record<string, unknown> | null;
  /**
   * Gmail-specific. Only present when ``provider === "gmail"``. Indicates
   * whether the host's OAuth tokens include the ``gmail.send`` scope (added
   * in PR 2.3 — pre-existing integrations require a one-time reconnect).
   */
  has_send_scope?: boolean;
}
