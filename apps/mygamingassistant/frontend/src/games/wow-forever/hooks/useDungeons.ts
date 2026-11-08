import { useCallback, useEffect, useState } from "react";
import { loadDungeons } from "@/games/wow-forever/lib/dungeons/loadDungeons";
import type { DungeonsData } from "@/games/wow-forever/types/dungeons/dungeonsData";
import type { DungeonsState } from "@/games/wow-forever/types/dungeons/dungeonsState";

interface Loaded {
  attempt: number;
  data: DungeonsData | null;
}

/** The dungeon pages' data; loads again on retry after a failed load. */
export function useDungeons(): DungeonsState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    loadDungeons().then(
      (data) => live && setLoaded({ attempt, data }),
      () => live && setLoaded({ attempt, data: null }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  if (!loaded) return { status: "loading" };
  if (loaded.data) return { status: "ready", data: loaded.data };
  return { status: "error", retry, retrying: loaded.attempt !== attempt };
}
