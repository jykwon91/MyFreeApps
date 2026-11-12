import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";
import type { SkippedGuildTitle } from "@/games/wow-forever/types/guild/skippedGuildTitle";

/** Every title the guild's members hold, and the ones skipped for a big tie. */
export interface GuildTitles {
  /** All-time titles first, then professions, then this week's. */
  awarded: GuildTitle[];
  skipped: SkippedGuildTitle[];
  /** A member's titles in that same order. */
  bySlug: ReadonlyMap<string, readonly GuildTitle[]>;
}
