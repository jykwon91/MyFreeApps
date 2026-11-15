import { useCallback, useEffect, useMemo, useState } from "react";
import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { loadCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { isCraftingProfession } from "@/games/wow-forever/lib/guideProfession";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { LoadStatus } from "@/games/wow-forever/types/loadStatus";

export interface CraftingDataSetState {
  status: LoadStatus;
  /** Every profession asked for that has loaded. */
  data: ReadonlyMap<CraftingProfession, CraftingData>;
  retry: () => void;
}

function statusOf(failed: boolean, loaded: number, wanted: number): LoadStatus {
  if (failed) return LOAD_STATUS.error;
  return loaded === wanted ? LOAD_STATUS.ready : LOAD_STATUS.loading;
}

/** Several crafting professions' data at once; each file is kept once it has loaded. */
export function useCraftingDataSet(professions: readonly CraftingProfession[]): CraftingDataSetState {
  const [loaded, setLoaded] = useState<ReadonlyMap<CraftingProfession, CraftingData>>(() => new Map());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A stable key, so a new array with the same professions doesn't reload.
  const key = professions.join(",");
  const wanted = useMemo(() => key.split(",").filter(isCraftingProfession), [key]);

  useEffect(() => {
    let active = true;
    Promise.all(wanted.map(async (p) => [p, await loadCraftingData(p)] as const))
      .then((pairs) => {
        if (!active) return;
        setFailed(false);
        setLoaded((prev) => new Map([...prev, ...pairs]));
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [wanted, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const data = useMemo(
    () => new Map(wanted.flatMap((p) => {
      const d = loaded.get(p);
      return d ? [[p, d] as const] : [];
    })),
    [loaded, wanted],
  );
  return { status: statusOf(failed, data.size, wanted.length), data, retry };
}
