import { useSyncExternalStore } from "react";

// Reactive auth store — allows React components to re-render immediately
// when the JWT token is added or removed (e.g., by the axios 401 interceptor,
// by an explicit logout, or by a sibling tab via the browser storage event).
// This module has zero dependencies on api.ts or auth.ts to avoid circular imports.

type Listener = () => void;
const listeners = new Set<Listener>();

// Single shared storage-event handler so every subscriber reacts to cross-tab
// token changes without each hook instance attaching its own listener.
function handleStorageEvent(event: StorageEvent): void {
  // `event.key === null` means localStorage.clear() was called
  if (event.key === "token" || event.key === null) {
    listeners.forEach((l) => l());
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", handleStorageEvent);
}

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
  const token = localStorage.getItem("token");
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
