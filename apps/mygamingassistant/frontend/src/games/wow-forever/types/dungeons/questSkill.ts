/** The profession a quest needs before its giver offers it (Pratt McGrubben's Wild Leather quests: Leatherworking 225). */
export interface QuestSkill {
  /** The profession's client SkillLine id (165 = Leatherworking). */
  skillLine: number;
  level: number;
}
