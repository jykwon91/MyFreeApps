import type { GUILD_STAT_FIELDS } from "@/games/wow-forever/data/guild/leaderboardConfig";

/** A member stat a leaderboard can rank. */
export type GuildStatField = (typeof GUILD_STAT_FIELDS)[keyof typeof GUILD_STAT_FIELDS];
