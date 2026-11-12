import { useCallback, useState } from "react";
import { RECENT_CHARACTERS_STORAGE_KEY } from "@/games/wow-forever/data/character/characterConfig";
import { parseRecentCharacters, withRecentCharacter } from "@/games/wow-forever/lib/character/recentCharacters";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";

/** The characters this browser looked up (slugs, most recent first) and a way to add one. */
export function useRecentCharacters(): [string[], (slug: string) => void] {
  const [recent, setRecent] = useState<string[]>(() => readStored(RECENT_CHARACTERS_STORAGE_KEY, parseRecentCharacters, []));
  const remember = useCallback((slug: string) => {
    setRecent((current) => {
      const next = withRecentCharacter(current, slug);
      writeStored(RECENT_CHARACTERS_STORAGE_KEY, next);
      return next;
    });
  }, []);
  return [recent, remember];
}
