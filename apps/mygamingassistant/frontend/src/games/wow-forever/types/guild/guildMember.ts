import type { GuildMemberBaseline } from "@/games/wow-forever/types/guild/guildMemberBaseline";
import type { GuildMemberSkill } from "@/games/wow-forever/types/guild/guildMemberSkill";

/**
 * One stored guild member (GET /api/wow/guilds/{slug}). The numbers are from
 * the member's newest stored day; null = Blizzard never sent it (never 0).
 */
export interface GuildMember {
  slug: string;
  name: string;
  surname: string;
  /** Blizzard's class name ("Warlock"); null when unknown. */
  class_name: string | null;
  level: number | null;
  item_level: number | null;
  honorable_kills: number | null;
  killing_blows: number | null;
  deaths_from_players: number | null;
  total_kills: number | null;
  total_deaths: number | null;
  /** Tracked dungeons with a final-boss kill. */
  dungeons_done: number | null;
  exalted_reputations: number | null;
  /**
   * What the gains boards count from: the newest stored day at least a week
   * old, else the earliest; null when there's no older day to count from.
   */
  baseline: GuildMemberBaseline | null;
  /** From the newest stored day that has professions; [] when none is stored. */
  professions: GuildMemberSkill[];
  /** 0 = guild master; null until the roster refresh ranks the member. */
  rank: number | null;
  /** ISO time the member was last fetched from Blizzard. */
  refreshed_at: string;
}
