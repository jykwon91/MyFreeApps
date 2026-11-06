import { useCallback, useEffect, useState } from "react";
import { GATHERING_GUIDES } from "@/games/wow-forever/data/professions/gathering/gatheringGuides";
import { loadGatheringData } from "@/games/wow-forever/gathering/loadGatheringData";
import type { GatheringData } from "@/games/wow-forever/types/gathering/gatheringData";
import type { GatheringDataState } from "@/games/wow-forever/types/gathering/gatheringDataState";
import type { GatheringProfession } from "@/games/wow-forever/types/gathering/gatheringProfession";

/** The generated spawn, zone and crafts data for one gathering guide — loaded only when it opens. */
export function useGatheringData(profession: GatheringProfession): GatheringDataState {
  const [result, setResult] = useState<{ profession: GatheringProfession; data: GatheringData | null } | null>(null);
  // The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
  const retry = useCallback(() => window.location.reload(), []);

  useEffect(() => {
    let live = true;
    loadGatheringData(GATHERING_GUIDES[profession]).then(
      (data) => live && setResult({ profession, data }),
      () => live && setResult({ profession, data: null }),
    );
    return () => {
      live = false;
    };
  }, [profession]);

  if (!result || result.profession !== profession) return { status: "loading" };
  if (!result.data) return { status: "error", retry };
  return { status: "ready", data: result.data };
}
