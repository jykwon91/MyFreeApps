import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { guildTabFromParams, guildTabImplied, withGuildTab } from "@/games/wow-forever/lib/guild/guildTabParams";
import type { GuildTab } from "@/games/wow-forever/types/guild/guildTab";

/**
 * The guild page's open tab, kept in the URL; picking one replaces the history entry.
 * An old link that opens a tab without naming it (`?recipe=linen`) gets the tab written in,
 * so clearing that search later doesn't jump back to the first tab. Call it once per page.
 */
export function useGuildTab(): [GuildTab, (tab: GuildTab) => void] {
  const [params, setParams] = useSearchParams();
  const tab = guildTabFromParams(params);
  const pick = useCallback((next: GuildTab) => setParams((current) => withGuildTab(current, next), { replace: true }), [setParams]);
  useEffect(() => {
    if (guildTabImplied(params)) pick(tab);
  }, [params, pick, tab]);
  return [tab, pick];
}
