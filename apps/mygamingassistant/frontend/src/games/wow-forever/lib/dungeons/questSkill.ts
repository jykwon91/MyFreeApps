import { professionName } from "@/games/wow-forever/lib/guild/guildRecipes";
import type { QuestSkill } from "@/games/wow-forever/types/dungeons/questSkill";

/** A quest row's `skill` column ([SkillLine id, skill] or null). */
export function questSkill(value: unknown): QuestSkill | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const [skillLine, level] = value.map(Number);
  return skillLine > 0 && level > 0 ? { skillLine, level } : null;
}

/** The hardest of several needs (a line asks for the highest skill any of its quests needs), or null when none. */
export function strictestSkill(skills: readonly (QuestSkill | null)[]): QuestSkill | null {
  return skills.reduce<QuestSkill | null>((best, s) => (s && (!best || s.level > best.level) ? s : best), null);
}

/** "Leatherworking 225". */
export function questSkillText(skill: QuestSkill): string {
  return `${professionName(skill.skillLine)} ${skill.level}`;
}

/** Equal needs, for lines that share their quests before. */
export function skillKey(skill: QuestSkill | null): string {
  return skill ? `${skill.skillLine}:${skill.level}` : "";
}
