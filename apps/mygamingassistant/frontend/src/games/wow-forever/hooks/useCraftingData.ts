import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { useCallback, useEffect, useState } from "react";
import { loadCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";

export type CraftingDataState =
  | { status: typeof LOAD_STATUS.loading }
  | { status: typeof LOAD_STATUS.error; retry: () => void }
  | { status: typeof LOAD_STATUS.ready; data: CraftingData };

/** The generated recipe, trainer and source data for one crafting profession. */
export function useCraftingData(profession: CraftingProfession): CraftingDataState {
  const [result, setResult] = useState<{ profession: CraftingProfession; data: CraftingData | null } | null>(null);
  // The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
  const retry = useCallback(() => window.location.reload(), []);

  useEffect(() => {
    let live = true;
    loadCraftingData(profession).then(
      (data) => live && setResult({ profession, data }),
      () => live && setResult({ profession, data: null }),
    );
    return () => {
      live = false;
    };
  }, [profession]);

  if (!result || result.profession !== profession) return { status: LOAD_STATUS.loading };
  if (!result.data) return { status: LOAD_STATUS.error, retry };
  return { status: LOAD_STATUS.ready, data: result.data };
}
