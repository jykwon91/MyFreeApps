/**
 * Where the session JWT lives. Synchronous because `useIsAuthenticated` reads it
 * through `useSyncExternalStore`; a platform with asynchronous storage hydrates
 * it into memory before configuring.
 */
export interface TokenStore {
  /** Must not throw: unavailable storage reads as signed out. */
  get(): string | null;
  /**
   * Throws if the token can't be kept, so a sign-in fails visibly rather than
   * reporting success and then reading as signed out.
   */
  set(token: string): void;
  /** Must not throw: unavailable storage has nothing to clear. */
  clear(): void;
}
