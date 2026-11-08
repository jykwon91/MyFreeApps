import { useCallback, useEffect, useState } from "react";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { loadTalentClass } from "@/games/wow-forever/lib/talents/loadTalentClass";
import type { TalentClassData } from "@/games/wow-forever/types/talents/talentClassData";
import type { TalentClassState } from "@/games/wow-forever/types/talents/talentClassState";

interface Loaded {
  classId: WowClassId;
  attempt: number;
  data: TalentClassData | null;
}

/** One class's talent trees (its own lazy chunk); loads again on retry after a failed load. */
export function useTalentClass(classId: WowClassId): TalentClassState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    loadTalentClass(classId).then(
      (data) => live && setLoaded({ classId, attempt, data }),
      () => live && setLoaded({ classId, attempt, data: null }),
    );
    return () => {
      live = false;
    };
  }, [classId, attempt]);

  // A class switch shows the skeleton, never the last class's trees.
  if (!loaded || loaded.classId !== classId) return { status: "loading" };
  if (loaded.data) return { status: "ready", data: loaded.data };
  return { status: "error", retry, retrying: loaded.attempt !== attempt };
}
