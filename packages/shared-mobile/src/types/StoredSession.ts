export interface StoredSession {
  refreshToken: string;
  sessionId: string;
  email: string;
  /** iOS keeps secure items after an uninstall, so this tells a session from an earlier install. */
  installedAt: string | null;
}
