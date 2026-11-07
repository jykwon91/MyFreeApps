import { useCallback, useEffect, useState } from "react";
import { loadItemPage } from "@/games/wow-forever/lib/itemPages/itemPageLoader";
import type { ItemPageResult } from "@/games/wow-forever/types/itemPages/itemPageResult";
import type { ItemPageState } from "@/games/wow-forever/types/itemPages/itemPageState";

interface Loaded {
  itemId: number | null;
  attempt: number;
  result: ItemPageResult | null;
}

/** One item page's data; loads again when the id changes, and on retry after a failed load. */
export function useItemPage(itemId: number | null): ItemPageState {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    loadItemPage(itemId).then(
      (result) => live && setLoaded({ itemId, attempt, result }),
      () => live && setLoaded({ itemId, attempt, result: null }),
    );
    return () => {
      live = false;
    };
  }, [itemId, attempt]);

  if (!loaded || loaded.itemId !== itemId) return { status: "loading" };
  if (loaded.result) return { status: "ready", result: loaded.result };
  return { status: "error", retry, retrying: loaded.attempt !== attempt };
}
