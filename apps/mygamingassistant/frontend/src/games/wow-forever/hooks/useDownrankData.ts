import { useCallback, useEffect, useState } from "react";
import { loadDownrank } from "@/games/wow-forever/lib/downrank/loadDownrank";
import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";
import type { DownrankLoadState } from "@/games/wow-forever/types/downrank/downrankLoadState";

interface Loaded {
  attempt: number;
  families: readonly DownrankFamily[] | null;
}

/** The calculator's spell families (a lazy chunk, loaded once); loads again on retry after a failure. */
export function useDownrankData(): DownrankLoadState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    loadDownrank().then(
      (families) => live && setLoaded({ attempt, families }),
      () => live && setLoaded({ attempt, families: null }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  if (!loaded) return { status: "loading" };
  if (loaded.families) return { status: "ready", families: loaded.families };
  return { status: "error", retry, retrying: loaded.attempt !== attempt };
}
