import type { GuildMatchType } from "@/games/wow-forever/types/guild/guildMatch";

/** The Help each other tab's choices, kept in the URL. */
export interface GuildHelpFilters {
  type: GuildMatchType | "all";
  /** Who the help is for (a member slug); null = everyone. */
  forSlug: string | null;
  /** Whose recipes count (a member slug); null = anyone in the guild. */
  bySlug: string | null;
}
