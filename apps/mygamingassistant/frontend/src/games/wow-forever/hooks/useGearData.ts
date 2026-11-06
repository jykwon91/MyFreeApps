import { useCallback, useEffect, useMemo, useState } from "react";
import { loadGearData } from "@/games/wow-forever/gear/gearDataLoader";
import { loadClientItems } from "@/games/wow-forever/lib/clientItemsLoader";
import type { GearDataState } from "@/games/wow-forever/types/gearDataState";

type Ready = Extract<GearDataState, { status: "ready" }>;

/**
 * The item list and the gear sources/facts, loaded together; Retry reloads
 * whichever failed. The returned object only changes when the data or the
 * retry state does, so callers can memoise on it.
 */
export function useGearData(): GearDataState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; data: Ready | null } | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    Promise.all([loadClientItems(), loadGearData()]).then(
      ([list, gear]) => live && setResult({ attempt, data: { status: "ready", list, gear } }),
      () => live && setResult({ attempt, data: null }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  return useMemo<GearDataState>(() => {
    if (result?.data) return result.data;
    if (result) return { status: "error", retry, retrying: result.attempt !== attempt };
    return { status: "loading" };
  }, [result, retry, attempt]);
}
