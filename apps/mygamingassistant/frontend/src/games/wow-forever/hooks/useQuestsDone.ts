import { useCallback, useEffect, useState } from "react";
import { QUESTS_DONE_STORAGE_KEY } from "@/games/wow-forever/data/dungeons/questProgressConfig";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";

function parseIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((v): v is number => Number.isInteger(v));
}

function readDone(): ReadonlySet<number> {
  return new Set(readStored(QUESTS_DONE_STORAGE_KEY, parseIds, []));
}

/**
 * The quests you've ticked as done, in this browser — one list for every page
 * (a quest ticked on one dungeon page is done on all of them). Another tab's
 * ticks arrive through the `storage` event.
 */
export function useQuestsDone(): {
  done: ReadonlySet<number>;
  setDone: (ids: readonly number[], value: boolean) => void;
} {
  const [done, setDoneState] = useState<ReadonlySet<number>>(readDone);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === QUESTS_DONE_STORAGE_KEY) setDoneState(readDone());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setDone = useCallback((ids: readonly number[], value: boolean) => {
    setDoneState((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      writeStored(QUESTS_DONE_STORAGE_KEY, [...next]);
      return next;
    });
  }, []);

  return { done, setDone };
}
