/**
 * The triage key, in MEMORY ONLY — this module's variable inside the triage chunk. Never written to
 * localStorage, sessionStorage, a cookie, the URL or Redux, and never logged. It's forgotten after
 * TRIAGE_IDLE_LOCK_MS without activity, on the Lock button, and when the server refuses it (404/401).
 */
import { TRIAGE_IDLE_LOCK_MS } from "@/games/wow-forever/data/featureRequests/triage/triageConfig";
import type { TriageKeySnapshot } from "@/games/wow-forever/types/featureRequests/triage/triageKeySnapshot";
import type { TriageLockReason } from "@/games/wow-forever/types/featureRequests/triage/triageLockReason";

let key: string | null = null;
let snapshot: TriageKeySnapshot = { unlocked: false, lockReason: null };
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function setSnapshot(next: TriageKeySnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

function clearIdleTimer(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = null;
}

function armIdleTimer(): void {
  clearIdleTimer();
  idleTimer = setTimeout(() => lockTriage("idle"), TRIAGE_IDLE_LOCK_MS);
}

/** Keep a key the server accepted. */
export function unlockTriage(newKey: string): void {
  key = newKey;
  armIdleTimer();
  setSnapshot({ unlocked: true, lockReason: null });
}

/** Forget the key. A no-op when already locked (the first reason stays). */
export function lockTriage(reason: TriageLockReason): void {
  if (key === null) return;
  key = null;
  clearIdleTimer();
  setSnapshot({ unlocked: false, lockReason: reason });
}

/** The key for the next request, or null when locked. */
export function getTriageKey(): string | null {
  return key;
}

/** Activity (a tap, a key press, a call): restart the 15-minute idle clock. */
export function touchTriage(): void {
  if (key !== null) armIdleTimer();
}

export function subscribeTriageKey(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Stable between changes (for `useSyncExternalStore`). */
export function getTriageKeySnapshot(): TriageKeySnapshot {
  return snapshot;
}
