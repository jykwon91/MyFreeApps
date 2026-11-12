import type { LEADERBOARD_SOURCE_KIND } from "@/games/wow-forever/data/guild/leaderboardConfig";
import type { GuildGainField } from "@/games/wow-forever/types/guild/guildGainField";
import type { GuildStatField } from "@/games/wow-forever/types/guild/guildStatField";

/** Where a leaderboard reads each member's number: one of their stats, how much one grew, or one profession's skill. */
export type LeaderboardSource =
  | { kind: typeof LEADERBOARD_SOURCE_KIND.stat; field: GuildStatField }
  | { kind: typeof LEADERBOARD_SOURCE_KIND.gain; field: GuildGainField }
  | { kind: typeof LEADERBOARD_SOURCE_KIND.profession; professionId: number };
