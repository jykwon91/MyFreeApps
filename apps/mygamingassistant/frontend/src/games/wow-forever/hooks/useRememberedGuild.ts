import { useCallback, useState } from "react";
import { REMEMBERED_GUILD_STORAGE_KEY } from "@/games/wow-forever/data/guild/guildFinderConfig";
import { parseRememberedGuild } from "@/games/wow-forever/lib/guild/rememberedGuild";
import { readStored, removeStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import type { RememberedGuild } from "@/games/wow-forever/types/guild/rememberedGuild";
import type { RememberedGuildState } from "@/games/wow-forever/types/guild/rememberedGuildState";

/** The guild of the last character this browser looked up (the Guild menu item opens it). */
export function useRememberedGuild(): RememberedGuildState {
  const [guild, setGuild] = useState<RememberedGuild | null>(() =>
    readStored(REMEMBERED_GUILD_STORAGE_KEY, parseRememberedGuild, null),
  );
  const remember = useCallback((next: RememberedGuild) => {
    writeStored(REMEMBERED_GUILD_STORAGE_KEY, next);
    setGuild(next);
  }, []);
  const forget = useCallback(() => {
    removeStored(REMEMBERED_GUILD_STORAGE_KEY);
    setGuild(null);
  }, []);
  return { guild, remember, forget };
}
