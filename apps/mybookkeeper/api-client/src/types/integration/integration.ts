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
  /**
   * Gmail-specific. True when Google has rejected the stored refresh token
   * (testing-mode 7-day expiry, user revocation, or password change). All
   * Gmail-dependent features are blocked until the user completes a new
   * OAuth flow. Cleared automatically on a successful reconnect.
   */
  needs_reauth?: boolean;
  /**
   * Short repr of the RefreshError that triggered the needs_reauth flag.
   * For diagnostic display only — not shown to end users.
   */
  last_reauth_error?: string | null;
}
