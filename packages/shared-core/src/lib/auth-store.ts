import { useSyncExternalStore } from "react";
import { getPlatform } from "../platform/configurePlatform";

// Not part of the ES library, and this package has no DOM lib. Browsers provide it;
// a React Native host needs an engine that does too.
declare function atob(data: string): string;

// Reactive auth store — allows React components to re-render immediately
// when the JWT token is added or removed (e.g., by the axios 401 interceptor,
// or by an explicit logout). A host whose token can change from outside the app
// (a sibling browser tab) calls notifyAuthChange() itself.
// This module has zero dependencies on api.ts or auth.ts to avoid circular imports.

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyAuthChange(): void {
  listeners.forEach((l) => l());
}

function getSnapshot(): boolean {
  const token = getPlatform().tokenStore.get();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function useIsAuthenticated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
