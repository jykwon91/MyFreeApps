import type { GuildRecipe } from "@/games/wow-forever/types/guild/guildRecipe";

/** GET /api/wow/guilds/{slug}/recipes?q=: the guild's known recipes whose name contains the query. */
export interface GuildRecipeSearch {
  query: string;
  /** By name. */
  recipes: GuildRecipe[];
  /** More recipes matched than were sent: type more of the name. */
  truncated: boolean;
}
