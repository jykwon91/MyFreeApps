import type { LEADERBOARD_SOURCE_KIND } from "@/games/wow-forever/data/guild/leaderboardConfig";
import type { GuildStatField } from "@/games/wow-forever/types/guild/guildStatField";

/** Where a leaderboard reads each member's number: one of their stats, or one profession's skill. */
export type LeaderboardSource =
  | { kind: typeof LEADERBOARD_SOURCE_KIND.stat; field: GuildStatField }
  | { kind: typeof LEADERBOARD_SOURCE_KIND.profession; professionId: number };
