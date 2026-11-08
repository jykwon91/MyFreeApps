import { useCallback, useEffect, useState } from "react";
import { loadChangeCategory } from "@/games/wow-forever/lib/changes/loadChangeCategory";
import { classChangesFor } from "@/games/wow-forever/lib/changes/classChangesFor";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";

export interface ClassChanges {
  /** Changed talents for this class. */
  talents: readonly ChangeEntry[];
  /** Changed class spells for this class. */
  spells: readonly ChangeEntry[];
}

export type ClassChangesState =
  | { status: "loading" }
  | { status: "ready"; data: ClassChanges }
  | { status: "error"; retry: () => void; retrying: boolean };

interface Loaded {
  classId: WowClassId;
  attempt: number;
  data: ClassChanges | null;
}

/**
 * Loads talents and class-spell changes for `classId`.
 *
 * Reuses the same lazy shards as the Changes page — a second caller in the same
 * visit gets the cached promise. Order is the generator's output order.
 */
export function useClassChanges(classId: WowClassId): ClassChangesState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    Promise.all([loadChangeCategory("talents"), loadChangeCategory("spells")]).then(
      ([talentEntries, spellEntries]) => {
        if (!live) return;
        setLoaded({
          classId,
          attempt,
          data: {
            talents: classChangesFor(talentEntries, classId),
            spells: classChangesFor(spellEntries, classId),
          },
        });
      },
      () => live && setLoaded({ classId, attempt, data: null }),
    );
    return () => {
      live = false;
    };
  }, [classId, attempt]);

  if (!loaded || loaded.classId !== classId) return { status: "loading" };
  if (loaded.data) return { status: "ready", data: loaded.data };
  return { status: "error", retry, retrying: loaded.attempt !== attempt };
}
