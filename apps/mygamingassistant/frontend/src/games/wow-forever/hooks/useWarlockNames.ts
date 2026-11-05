import { useCallback, useEffect, useState } from "react";
import type { WarlockNames } from "@/games/wow-forever/types/warlockNames";

export type WarlockNamesState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; names: WarlockNames };

/** The Forever client's Warlock names, loaded only when the macros page opens. */
export function useWarlockNames(): WarlockNamesState {
  const [result, setResult] = useState<WarlockNames | null | undefined>(undefined);
  // The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
  const retry = useCallback(() => window.location.reload(), []);

  useEffect(() => {
    let live = true;
    import("@/games/wow-forever/data/warlock/warlockNames.json").then(
      (m) => live && setResult(m.default as WarlockNames),
      () => live && setResult(null),
    );
    return () => {
      live = false;
    };
  }, []);

  if (result === undefined) return { status: "loading" };
  if (result === null) return { status: "error", retry };
  return { status: "ready", names: result };
}
