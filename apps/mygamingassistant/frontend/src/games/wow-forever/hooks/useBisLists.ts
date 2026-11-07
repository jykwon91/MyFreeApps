import { useEffect, useReducer, useRef, type Dispatch } from "react";
import { BIS_LISTS_STORAGE_KEY } from "@/games/wow-forever/data/bisLists/bisListConfig";
import { bisListsReducer, EMPTY_BIS_LISTS } from "@/games/wow-forever/lib/bisLists/bisListsReducer";
import { parseStoredBisLists } from "@/games/wow-forever/lib/bisLists/parseStoredBisLists";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { BisList } from "@/games/wow-forever/types/bisLists/bisList";
import type { BisListAction } from "@/games/wow-forever/types/bisLists/bisListAction";
import type { BisListsState } from "@/games/wow-forever/types/bisLists/bisListsState";

function loadStored(): BisListsState {
  return readStored(BIS_LISTS_STORAGE_KEY, parseStoredBisLists, EMPTY_BIS_LISTS);
}

/**
 * The player's saved lists, kept in localStorage. Storage can be missing
 * (private mode, blocked) — the lists then work for this visit only.
 * Nothing is written until something changes, so an unreadable value from
 * a newer version isn't overwritten just by opening the page. A change
 * saved in another tab is picked up here (and not written back), so one
 * tab never overwrites what another saved.
 */
export function useBisLists(): [BisListsState, Dispatch<BisListAction>] {
  const [state, dispatch] = useReducer(bisListsReducer, undefined, loadStored);
  const saved = useRef(state);
  const fromOtherTab = useRef<readonly BisList[] | null>(null);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== null && event.key !== BIS_LISTS_STORAGE_KEY) return;
      const incoming = loadStored();
      fromOtherTab.current = incoming.lists;
      dispatch({ type: "load", state: incoming });
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (state === saved.current) return;
    saved.current = state;
    if (state.lists === fromOtherTab.current) {
      fromOtherTab.current = null;
      return;
    }
    writeStored(BIS_LISTS_STORAGE_KEY, state);
  }, [state]);

  return [state, dispatch];
}
