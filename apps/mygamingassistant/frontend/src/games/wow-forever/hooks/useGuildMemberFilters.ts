import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { GUILD_PARAMS } from "@/games/wow-forever/data/guild/guildConfig";
import { filtersFromParams, paramsFromFilters } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildMemberFilters } from "@/games/wow-forever/types/guild/guildMemberFilters";

/**
 * The guild member list's search, filters and sort, kept in the URL so a
 * member's page and Back return to the same list. Changes replace the history
 * entry, so Back never walks through every keystroke, and leave the page's
 * other params (the leaderboard's) as they are.
 */
export function useGuildMemberFilters(): [GuildMemberFilters, (next: GuildMemberFilters) => void] {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const update = useCallback(
    (next: GuildMemberFilters) =>
      setParams(
        (current) => {
          const merged = new URLSearchParams(current);
          for (const key of Object.values(GUILD_PARAMS)) merged.delete(key);
          for (const [key, value] of paramsFromFilters(next)) merged.set(key, value);
          return merged;
        },
        { replace: true },
      ),
    [setParams],
  );
  return [filters, update];
}
