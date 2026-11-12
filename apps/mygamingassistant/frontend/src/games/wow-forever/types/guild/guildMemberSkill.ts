/** One profession a guild member has learned. `id` is the client's SkillLine id (197 Tailoring, 185 Cooking…). */
export interface GuildMemberSkill {
  id: number;
  skill: number;
  /** The current rank's cap (75 / 150 / 225 / 300). */
  max_skill: number;
}
