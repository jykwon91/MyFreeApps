import type { LEADERBOARD_SOURCE_KIND } from "@/games/wow-forever/data/guild/leaderboardConfig";
import type { GuildGainField } from "@/games/wow-forever/types/guild/guildGainField";
import type { GuildStatField } from "@/games/wow-forever/types/guild/guildStatField";

/**
 * Where a leaderboard reads each member's number: one of their stats, how much one grew, one
 * profession's skill, or their standing with a faction (fetched for the faction picked, not on the member).
 */
export type LeaderboardSource =
  | { kind: typeof LEADERBOARD_SOURCE_KIND.stat; field: GuildStatField }
  | { kind: typeof LEADERBOARD_SOURCE_KIND.gain; field: GuildGainField }
  | { kind: typeof LEADERBOARD_SOURCE_KIND.profession; professionId: number }
  | { kind: typeof LEADERBOARD_SOURCE_KIND.faction };
