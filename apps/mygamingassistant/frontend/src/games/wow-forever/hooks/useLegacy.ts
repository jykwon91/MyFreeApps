import { useEffect, useState } from "react";
import { LEGACY_STATUS } from "@/games/wow-forever/data/legacy/legacyConfig";
import { loadLegacy } from "@/games/wow-forever/lib/legacy/loadLegacy";
import type { LegacyData } from "@/games/wow-forever/types/legacy/legacyData";
import type { LegacyState } from "@/games/wow-forever/types/legacy/legacyState";

// The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
const reloadPage = () => window.location.reload();

/** The Legacy planner's data, loaded on mount. */
export function useLegacy(): LegacyState {
  const [data, setData] = useState<LegacyData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadLegacy().then(
      (loaded) => live && setData(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  if (data) return { status: LEGACY_STATUS.ready, data };
  if (failed) return { status: LEGACY_STATUS.error, retry: reloadPage };
  return { status: LEGACY_STATUS.loading };
}
