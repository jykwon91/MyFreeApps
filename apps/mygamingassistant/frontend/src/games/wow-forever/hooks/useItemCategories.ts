import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import { useCallback, useEffect, useState } from "react";
import { loadItemCategories } from "@/games/wow-forever/lib/itemCategoriesLoader";
import type { ItemCategoryIndex } from "@/games/wow-forever/types/auctionHouse/itemCategoryIndex";

export type ItemCategoriesState =
  | { status: typeof LOAD_STATUS.loading }
  | { status: typeof LOAD_STATUS.error; retry: () => void; retrying: boolean }
  | { status: typeof LOAD_STATUS.ready; index: ItemCategoryIndex };

/**
 * The item categories (shared across every caller). With `enabled` false nothing is
 * requested and the state stays "loading" until it is true.
 */
export function useItemCategories(enabled: boolean): ItemCategoriesState {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; index: ItemCategoryIndex | null } | null>(null);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadItemCategories().then(
      (index) => live && setResult({ attempt, index }),
      () => live && setResult({ attempt, index: null }),
    );
    return () => {
      live = false;
    };
  }, [attempt, enabled]);

  if (result?.index) return { status: LOAD_STATUS.ready, index: result.index };
  if (result && result.index === null) {
    // Keep showing the error (with the button busy) while a retry is in flight.
    return { status: LOAD_STATUS.error, retry, retrying: result.attempt !== attempt };
  }
  return { status: LOAD_STATUS.loading };
}
