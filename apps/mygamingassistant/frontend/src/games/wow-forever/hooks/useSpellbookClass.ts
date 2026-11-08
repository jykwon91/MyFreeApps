import { useCallback, useEffect, useState } from "react";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { loadSpellbookClass } from "@/games/wow-forever/lib/spellbook/loadSpellbookClass";
import type { SpellbookClass } from "@/games/wow-forever/types/spellbook/spellbookClass";
import type { SpellbookLoadState } from "@/games/wow-forever/types/spellbook/spellbookLoadState";

interface Loaded {
  classId: WowClassId;
  attempt: number;
  data: SpellbookClass | null;
}

/** One class's spellbook (its own lazy chunk); loads again on retry after a failed load. */
export function useSpellbookClass(classId: WowClassId): SpellbookLoadState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    loadSpellbookClass(classId).then(
      (data) => live && setLoaded({ classId, attempt, data }),
      () => live && setLoaded({ classId, attempt, data: null }),
    );
    return () => {
      live = false;
    };
  }, [classId, attempt]);

  // A class switch shows the skeleton, never the last class's spells.
  if (!loaded || loaded.classId !== classId) return { status: "loading" };
  if (loaded.data) return { status: "ready", data: loaded.data };
  return { status: "error", retry, retrying: loaded.attempt !== attempt };
}
