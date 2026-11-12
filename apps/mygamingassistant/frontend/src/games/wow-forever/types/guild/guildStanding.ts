/** A guild member's standing with the chosen faction (GET /api/wow/guilds/{slug}/reputations). */
export interface GuildStanding {
  /** The member's character slug; the guild response's members carry the rest. */
  slug: string;
  /** 0 = Hated … 7 = Exalted. */
  tier: number;
  /** Progress within the tier, out of ``max``. */
  value: number;
  max: number;
}
