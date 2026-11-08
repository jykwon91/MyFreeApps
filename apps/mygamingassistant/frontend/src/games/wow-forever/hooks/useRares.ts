import { useEffect, useState } from "react";
import { loadRares } from "@/games/wow-forever/lib/rares/loadRares";
import type { RaresData } from "@/games/wow-forever/types/rares/raresData";
import type { RaresState } from "@/games/wow-forever/types/rares/raresState";

// The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
const reloadPage = () => window.location.reload();

/** The rares data, loaded the first time `wanted` is true and kept after that. */
export function useRares(wanted: boolean = true): RaresState {
  const [started, setStarted] = useState(wanted);
  const [data, setData] = useState<RaresData | null>(null);
  const [failed, setFailed] = useState(false);

  if (wanted && !started) setStarted(true);

  useEffect(() => {
    if (!started) return;
    let live = true;
    loadRares().then(
      (loaded) => live && setData(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [started]);

  if (data) return { status: "ready", data };
  if (failed) return { status: "error", retry: reloadPage };
  if (started) return { status: "loading" };
  return { status: "idle" };
}
