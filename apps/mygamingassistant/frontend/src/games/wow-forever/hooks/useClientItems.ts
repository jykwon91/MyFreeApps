import { useCallback, useEffect, useState } from "react";
import { loadClientItems } from "@/games/wow-forever/lib/clientItemsLoader";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";

export type ClientItemsState =
  | { status: "loading" }
  | { status: "error"; retry: () => void; retrying: boolean }
  | { status: "ready"; list: ClientItemList };

/** The game-file item list; starts loading on mount (shared across every caller). */
export function useClientItems(): ClientItemsState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; list: ClientItemList | null } | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    loadClientItems().then(
      (list) => live && setResult({ attempt, list }),
      () => live && setResult({ attempt, list: null }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  if (result?.list) return { status: "ready", list: result.list };
  if (result && result.list === null) {
    // Keep showing the error (with the button busy) while a retry is in flight.
    return { status: "error", retry, retrying: result.attempt !== attempt };
  }
  return { status: "loading" };
}
