/** One stored guild member (GET /api/wow/guilds/{slug}). */
export interface GuildMember {
  slug: string;
  name: string;
  surname: string;
  /** Blizzard's class name ("Warlock"); null when unknown. */
  class_name: string | null;
  level: number | null;
  item_level: number | null;
  /** 0 = guild master; null until the roster refresh ranks the member. */
  rank: number | null;
  /** ISO time the member was last fetched from Blizzard. */
  refreshed_at: string;
}
