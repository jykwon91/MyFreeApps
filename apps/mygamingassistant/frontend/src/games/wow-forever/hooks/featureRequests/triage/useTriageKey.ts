import { useSyncExternalStore } from "react";
import { getTriageKeySnapshot, subscribeTriageKey } from "@/games/wow-forever/lib/featureRequests/triage/triageKeyStore";
import type { TriageKeySnapshot } from "@/games/wow-forever/types/featureRequests/triage/triageKeySnapshot";

/** Whether the triage screen is unlocked, and why it last locked. Never exposes the key. */
export function useTriageKey(): TriageKeySnapshot {
  return useSyncExternalStore(subscribeTriageKey, getTriageKeySnapshot, getTriageKeySnapshot);
}
