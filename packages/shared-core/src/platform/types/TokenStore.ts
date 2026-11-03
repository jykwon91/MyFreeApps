/**
 * Where the session JWT lives. Synchronous because `useIsAuthenticated` reads it
 * through `useSyncExternalStore`; a platform with asynchronous storage hydrates
 * it into memory before configuring. Neither method may throw: unavailable
 * storage reads as signed out.
 */
export interface TokenStore {
  get(): string | null;
  clear(): void;
}
