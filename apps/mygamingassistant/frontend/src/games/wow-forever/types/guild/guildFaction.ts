/** A faction the guild's members have met (GET /api/wow/guilds/{slug}/reputations). */
export interface GuildFaction {
  /** Blizzard's faction id. */
  id: number;
  name: string;
  /** Live members with a stored standing for it. */
  members: number;
}
