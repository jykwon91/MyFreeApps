import type { GuildTab } from "@/games/wow-forever/types/guild/guildTab";

/** The guild page's tab in the URL (`?tab=roster`); left out for the first tab. */
export const GUILD_TAB_PARAM = "tab";
export const GUILD_TABS: readonly GuildTab[] = ["home", "titles", "crafting", "roster"];
export const GUILD_DEFAULT_TAB: GuildTab = "home";
export const GUILD_TAB_LABELS: Readonly<Record<GuildTab, string>> = {
  home: "Home",
  titles: "Titles",
  crafting: "Who can craft?",
  roster: "Roster",
};
/** Tabs that no longer exist, by the old `?tab=` value, and the tab that now holds what they showed. */
export const GUILD_LEGACY_TABS: Readonly<Record<string, GuildTab>> = {
  week: "home",
  arena: "home",
};
export const GUILD_TABS_LABEL = "Guild sections";
