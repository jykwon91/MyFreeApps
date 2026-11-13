import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { useCallback, useEffect, useState } from "react";
import { loadClientItems } from "@/games/wow-forever/lib/clientItemsLoader";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";

export type ClientItemsState =
  | { status: typeof LOAD_STATUS.loading }
  | { status: typeof LOAD_STATUS.error; retry: () => void; retrying: boolean }
  | { status: typeof LOAD_STATUS.ready; list: ClientItemList };

/**
 * The game-file item list; starts loading on mount (shared across every caller).
 * With `enabled` false nothing is requested and the state stays "loading" until it is true.
 */
export function useClientItems(enabled = true): ClientItemsState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; list: ClientItemList | null } | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadClientItems().then(
      (list) => live && setResult({ attempt, list }),
      () => live && setResult({ attempt, list: null }),
    );
    return () => {
      live = false;
    };
  }, [attempt, enabled]);

  if (result?.list) return { status: LOAD_STATUS.ready, list: result.list };
  if (result && result.list === null) {
    // Keep showing the error (with the button busy) while a retry is in flight.
    return { status: LOAD_STATUS.error, retry, retrying: result.attempt !== attempt };
  }
  return { status: LOAD_STATUS.loading };
}
