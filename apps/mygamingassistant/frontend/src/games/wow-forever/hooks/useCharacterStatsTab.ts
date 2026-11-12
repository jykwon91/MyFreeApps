import { useCallback, useState } from "react";
import { CHARACTER_STATS_TAB_STORAGE_KEY } from "@/games/wow-forever/data/character/characterStatsConfig";
import { defaultStatsTab, parseStatsTab } from "@/games/wow-forever/lib/character/characterStats";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { CharacterStatsTab } from "@/games/wow-forever/types/character/characterStatsTab";

/** The stats tab this browser picked; until it picks one, the tab the class looks at first. */
export function useCharacterStatsTab(className: string): [CharacterStatsTab, (tab: CharacterStatsTab) => void] {
  const [picked, setPicked] = useState<CharacterStatsTab | null>(() =>
    readStored<CharacterStatsTab | null>(CHARACTER_STATS_TAB_STORAGE_KEY, parseStatsTab, null),
  );
  const pick = useCallback((tab: CharacterStatsTab) => {
    setPicked(tab);
    writeStored(CHARACTER_STATS_TAB_STORAGE_KEY, tab);
  }, []);
  return [picked ?? defaultStatsTab(className), pick];
}
