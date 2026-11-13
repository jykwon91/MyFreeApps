import type { GuildSummary } from "@/games/wow-forever/types/guild/guildSummary";

/** GET /api/wow/guilds?q=: stored guilds whose name contains the query. */
export interface GuildSearch {
  query: string;
  /** Biggest first, then by name. */
  guilds: GuildSummary[];
  /** More matched than were sent: type more of the name. */
  truncated: boolean;
}
