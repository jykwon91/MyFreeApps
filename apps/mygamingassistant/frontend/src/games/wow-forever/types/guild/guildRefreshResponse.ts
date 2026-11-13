import type { GuildRefreshStatus } from "@/games/wow-forever/types/guild/guildRefreshStatus";

/** The answer to "Refresh now" (POST /api/wow/guilds/{slug}/refresh). */
export interface GuildRefreshResponse {
  status: GuildRefreshStatus;
  /** Seconds until the guild can be refreshed again. */
  retry_after_seconds: number;
}
