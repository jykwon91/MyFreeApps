import { useCallback, useEffect, useState } from "react";
import { loadTrainerServices } from "@/games/wow-forever/lib/trainers/loadTrainerServices";
import type { TrainerServices } from "@/games/wow-forever/types/trainers/trainerServices";
import type { TrainerServicesState } from "@/games/wow-forever/types/trainers/trainerServicesState";

interface Loaded {
  attempt: number;
  data: TrainerServices | null;
}

/** The trainer NPC data (its own lazy chunk); loads again on retry after a failed load. */
export function useTrainerServices(): TrainerServicesState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    loadTrainerServices().then(
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
