import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { filtersFromParams, paramsFromFilters } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildMemberFilters } from "@/games/wow-forever/types/guild/guildMemberFilters";

/**
 * The guild member list's search, filters and sort, kept in the URL so a
 * member's page and Back return to the same list. Changes replace the history
 * entry, so Back never walks through every keystroke.
 */
export function useGuildMemberFilters(): [GuildMemberFilters, (next: GuildMemberFilters) => void] {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const update = useCallback(
    (next: GuildMemberFilters) => setParams(paramsFromFilters(next), { replace: true }),
    [setParams],
  );
  return [filters, update];
}
