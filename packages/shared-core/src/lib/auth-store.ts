import { useSyncExternalStore } from "react";
import { getPlatform, onPlatformConfigured } from "../platform/configurePlatform";
import { callEach } from "../utils/callEach";
import { readJwtPayload } from "../utils/readJwtPayload";
import { tokenIdentity } from "../utils/tokenIdentity";
import type { AuthChangeOptions } from "./types/AuthChangeOptions";
import type { AuthListener } from "./types/AuthListener";

// Reactive auth store — allows React components to re-render immediately
// when the JWT token is added or removed (e.g., by the axios 401 interceptor,
// or by an explicit logout). A host whose token can change from outside the app
// (a sibling browser tab) calls notifyAuthChange() itself.
// This module has zero dependencies on api.ts or auth.ts to avoid circular imports.

const listeners = new Set<AuthListener>();
const identityListeners = new Set<AuthListener>();
const accountLeftListeners = new Set<AuthListener>();

// Whose token the subscribers were last told about, so whichever path changes the
// token, notifyAuthChange() can tell a new identity from a refresh for the same one.
let notifiedIdentity: string | null = null;
// Who was signed in last. Kept through a session the server ended or that expired, so
// the same person signing back in isn't taken for someone new.
let lastAccount: string | null = null;

onPlatformConfigured(({ tokenStore }) => {
  notifiedIdentity = tokenIdentity(tokenStore.get());
  lastAccount = notifiedIdentity;
});

function subscribe(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Run `listener` whenever notifyAuthChange() finds the token belongs to someone
 * else, or to no one, before any subscriber re-renders. State that belongs to one
 * user, such as the API cache, resets here.
 */
export function onIdentityChange(listener: AuthListener): () => void {
  identityListeners.add(listener);
  return () => {
    identityListeners.delete(listener);
  };
}

/**
 * Run `listener` when someone signs out, or a different account signs in. A session
 * the server ended or that expired doesn't count until then: signing back in as the
 * same person keeps what they were doing. For state kept outside the API cache that
 * one account was in the middle of, such as a stored session id.
 */
export function onAccountLeft(listener: AuthListener): () => void {
  accountLeftListeners.add(listener);
  return () => {
    accountLeftListeners.delete(listener);
  };
}

/**
 * Tell every subscriber the token may have changed; `signedOut` when the person
 * signed out on purpose. Every listener runs even when one throws, so a failing one
 * can't leave the cache unreset or the UI stale; the first error is rethrown afterwards.
 */
export function notifyAuthChange({ signedOut = false }: AuthChangeOptions = {}): void {
  const identity = tokenIdentity(getPlatform().tokenStore.get());
  const identityChanged = identity !== notifiedIdentity;
  notifiedIdentity = identity;
  const accountLeft = lastAccount !== null && (signedOut || (identity !== null && identity !== lastAccount));
  if (identity !== null) lastAccount = identity;
  else if (signedOut) lastAccount = null;
  callEach([
    ...(accountLeft ? accountLeftListeners : []),
    ...(identityChanged ? identityListeners : []),
    ...listeners,
  ]);
}

function getSnapshot(): boolean {
  const token = getPlatform().tokenStore.get();
  const exp = token ? readJwtPayload(token)?.exp : undefined;
  return typeof exp === "number" && exp * 1000 > Date.now();
}

export function useIsAuthenticated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
