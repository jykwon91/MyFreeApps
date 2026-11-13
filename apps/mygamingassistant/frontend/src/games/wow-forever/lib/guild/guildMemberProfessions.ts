import { PROFESSION_GROUPS, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import { crafterSkill, professionName } from "@/games/wow-forever/lib/guild/guildRecipes";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildMemberSkill } from "@/games/wow-forever/types/guild/guildMemberSkill";
import type { GuildProfessionCount } from "@/games/wow-forever/types/guild/guildProfessionCount";

/** The member's skill in a profession; null when they haven't learned it (or it isn't stored). */
export function memberProfessionSkill(member: GuildMember, profession: GuideProfession): GuildMemberSkill | null {
  const id = PROFESSION_SKILL_LINES[profession];
  return member.professions.find((p) => p.id === id) ?? null;
}

/** The profession's name, "Tailoring". */
export function professionLabel(profession: GuideProfession): string {
  return professionName(PROFESSION_SKILL_LINES[profession]);
}

/** The member's skill in a profession, "148 / 225"; null when they haven't learned it. */
export function memberSkill(member: GuildMember, profession: GuideProfession): string | null {
  const skill = memberProfessionSkill(member, profession);
  return skill ? crafterSkill(skill) : null;
}

/** "Tailoring 148 / 225" for a member card; null when they haven't learned it. */
export function memberSkillText(member: GuildMember, profession: GuideProfession): string | null {
  const skill = memberSkill(member, profession);
  return skill ? `${professionLabel(profession)} ${skill}` : null;
}

/** Each profession someone in the guild has, with how many have it, in the Professions picker's order. */
export function professionCounts(members: readonly GuildMember[]): GuildProfessionCount[] {
  return PROFESSION_GROUPS.flatMap((group) => group.options)
    .map((option) => ({
      id: option.id,
      label: option.label,
      count: members.filter((m) => memberProfessionSkill(m, option.id) !== null).length,
    }))
    .filter((p) => p.count > 0);
}
