/** One profession a guild member has, as returned by `GET /api/wow/guilds/{slug}/help`. */
export interface GuildHelpProfession {
  /** Blizzard's SkillLine id (197 Tailoring, 333 Enchanting…). */
  profession_id: number;
  name: string;
  skill: number;
  max_skill: number;
}
