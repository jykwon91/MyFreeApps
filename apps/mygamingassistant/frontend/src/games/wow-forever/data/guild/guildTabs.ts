import type { GuildTab } from "@/games/wow-forever/types/guild/guildTab";

/** The guild page's tab in the URL (`?tab=arena`); left out for the first tab. */
export const GUILD_TAB_PARAM = "tab";
export const GUILD_TABS: readonly GuildTab[] = ["week", "titles", "arena", "crafting", "roster"];
export const GUILD_DEFAULT_TAB: GuildTab = "week";
export const GUILD_TAB_LABELS: Readonly<Record<GuildTab, string>> = {
  week: "This week",
  titles: "Titles",
  arena: "Arena",
  crafting: "Who can craft?",
  roster: "Roster",
};
export const GUILD_TABS_LABEL = "Guild sections";
