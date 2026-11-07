import { useMemo, useSyncExternalStore } from "react";
import { WHATS_NEW } from "@/games/wow-forever/data/whatsNew";
import { pageVisitStore } from "@/games/wow-forever/lib/whatsNew/pageVisitStore";
import { pagesWithUpdates } from "@/games/wow-forever/lib/whatsNew/updateDots";

/** The WoW Forever pages with a "What's new" entry the player hasn't seen yet. */
export function useUpdateDots(): ReadonlySet<string> {
  const visits = useSyncExternalStore(pageVisitStore.subscribe, pageVisitStore.getSnapshot);
  return useMemo(() => pagesWithUpdates(WHATS_NEW, visits), [visits]);
}
