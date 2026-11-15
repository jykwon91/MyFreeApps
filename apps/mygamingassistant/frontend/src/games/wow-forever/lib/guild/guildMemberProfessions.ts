import { PROFESSION_GROUPS, type GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import { PROFESSION_RANK_BY_CAP } from "@/games/wow-forever/data/professions/professionRanks";
import { crafterSkill } from "@/games/wow-forever/lib/guild/guildRecipes";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildMemberProfession } from "@/games/wow-forever/types/guild/guildMemberProfession";
import type { GuildMemberSkill } from "@/games/wow-forever/types/guild/guildMemberSkill";
import type { GuildProfessionCount } from "@/games/wow-forever/types/guild/guildProfessionCount";

/** The member's skill in a profession; null when they haven't learned it (or it isn't stored). */
export function memberProfessionSkill(member: GuildMember, profession: GuideProfession): GuildMemberSkill | null {
  const id = PROFESSION_SKILL_LINES[profession];
  return member.professions.find((p) => p.id === id) ?? null;
}

const PICKER_OPTIONS = PROFESSION_GROUPS.flatMap((group) => group.options);

/** Every profession the member has, as roster chips: the filtered one first, then in the Professions picker's order. */
export function memberProfessions(member: GuildMember, first: GuideProfession | ""): GuildMemberProfession[] {
  const ordered = first ? [...PICKER_OPTIONS.filter((o) => o.id === first), ...PICKER_OPTIONS.filter((o) => o.id !== first)] : PICKER_OPTIONS;
  return ordered.flatMap((option) => {
    const skill = memberProfessionSkill(member, option.id);
    if (!skill) return [];
    return [{ profession: option.id, label: option.label, skill: crafterSkill(skill) ?? String(skill.skill), rank: PROFESSION_RANK_BY_CAP.get(skill.max_skill) ?? null }];
  });
}

/** Each profession someone in the guild has, with how many have it, in the Professions picker's order. */
export function professionCounts(members: readonly GuildMember[]): GuildProfessionCount[] {
  return PICKER_OPTIONS
    .map((option) => ({
      id: option.id,
      label: option.label,
      count: members.filter((m) => memberProfessionSkill(m, option.id) !== null).length,
    }))
    .filter((p) => p.count > 0);
}
