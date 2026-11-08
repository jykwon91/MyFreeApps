import { useEffect, useState } from "react";
import { RACES_STATUS } from "@/games/wow-forever/data/races/racesConfig";
import { loadRaces } from "@/games/wow-forever/lib/races/loadRaces";
import type { RacesData } from "@/games/wow-forever/types/races/racesData";
import type { RacesState } from "@/games/wow-forever/types/races/racesState";

// The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
const reloadPage = () => window.location.reload();

/** The races page's data, loaded on mount. */
export function useRaces(): RacesState {
  const [data, setData] = useState<RacesData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadRaces().then(
      (loaded) => live && setData(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  if (data) return { status: RACES_STATUS.ready, data };
  if (failed) return { status: RACES_STATUS.error, retry: reloadPage };
  return { status: RACES_STATUS.loading };
}
