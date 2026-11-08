import { useEffect, useState } from "react";
import { HUNTER_PETS_STATUS } from "@/games/wow-forever/data/hunterPets/hunterPetsConfig";
import { loadHunterPets } from "@/games/wow-forever/lib/hunterPets/loadHunterPets";
import type { HunterPetsData } from "@/games/wow-forever/types/hunterPets/hunterPetsData";
import type { HunterPetsState } from "@/games/wow-forever/types/hunterPets/hunterPetsState";

// The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
const reloadPage = () => window.location.reload();

/** The Hunter pets data, loaded when the page opens. */
export function useHunterPets(): HunterPetsState {
  const [data, setData] = useState<HunterPetsData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadHunterPets().then(
      (loaded) => live && setData(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  if (data) return { status: HUNTER_PETS_STATUS.ready, data };
  if (failed) return { status: HUNTER_PETS_STATUS.error, retry: reloadPage };
  return { status: HUNTER_PETS_STATUS.loading };
}
