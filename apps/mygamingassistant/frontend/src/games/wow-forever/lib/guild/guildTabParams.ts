import { GUILD_PARAMS } from "@/games/wow-forever/data/guild/guildConfig";
import { RECIPE_SEARCH_PARAM } from "@/games/wow-forever/data/guild/recipeSearchConfig";
import { GUILD_DEFAULT_TAB, GUILD_LEGACY_TABS, GUILD_TAB_PARAM, GUILD_TABS } from "@/games/wow-forever/data/guild/guildTabs";
import type { GuildTab } from "@/games/wow-forever/types/guild/guildTab";

const ROSTER_PARAMS = Object.values(GUILD_PARAMS);

function isGuildTab(value: string | null): value is GuildTab {
  return GUILD_TABS.some((t) => t === value);
}

function legacyGuildTab(value: string | null): GuildTab | undefined {
  return value !== null && Object.prototype.hasOwnProperty.call(GUILD_LEGACY_TABS, value) ? GUILD_LEGACY_TABS[value] : undefined;
}

/**
 * The tab a guild link opens on. `?tab=` wins; without it, a link made before
 * the tabs (a recipe search, a member filter) opens the tab that holds it, and a
 * retired tab (`?tab=week`, `?tab=arena`) opens Home, which now holds both; a board
 * or faction link is on Home already. Pure.
 */
export function guildTabFromParams(params: URLSearchParams): GuildTab {
  const tab = params.get(GUILD_TAB_PARAM);
  if (isGuildTab(tab)) return tab;
  const legacy = legacyGuildTab(tab);
  if (legacy) return legacy;
  if (params.has(RECIPE_SEARCH_PARAM)) return "crafting";
  if (ROSTER_PARAMS.some((p) => params.has(p))) return "roster";
  return GUILD_DEFAULT_TAB;
}

/**
 * The URL params with a tab picked, everything else kept. Any tab but the
 * first is written out, so clearing the param that opened it (a recipe
 * search, a member filter) never switches tabs; the first is left out unless
 * another param would open a different one. Pure.
 */
export function withGuildTab(current: URLSearchParams, tab: GuildTab): URLSearchParams {
  const next = new URLSearchParams(current);
  const others = new URLSearchParams(current);
  others.delete(GUILD_TAB_PARAM);
  // `set` keeps the param where it was, so the link doesn't reshuffle.
  if (tab !== GUILD_DEFAULT_TAB || guildTabFromParams(others) !== tab) next.set(GUILD_TAB_PARAM, tab);
  else next.delete(GUILD_TAB_PARAM);
  return next;
}

/** Whether the link opens a tab it doesn't name, which `withGuildTab` would write out. Pure. */
export function guildTabImplied(params: URLSearchParams): boolean {
  return withGuildTab(params, guildTabFromParams(params)).toString() !== params.toString();
}
