import type { GUILD_GAIN_FIELDS } from "@/games/wow-forever/data/guild/leaderboardConfig";

/** A member stat a gains board counts. */
export type GuildGainField = (typeof GUILD_GAIN_FIELDS)[keyof typeof GUILD_GAIN_FIELDS];
