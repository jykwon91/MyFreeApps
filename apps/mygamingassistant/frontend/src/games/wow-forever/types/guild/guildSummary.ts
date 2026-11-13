/** One guild in the guild search (GET /api/wow/guilds?q=). */
export interface GuildSummary {
  slug: string;
  name: string;
  /** alliance / horde */
  faction: string;
  /** Members at the last roster refresh; null before the first. */
  member_count: number | null;
}
