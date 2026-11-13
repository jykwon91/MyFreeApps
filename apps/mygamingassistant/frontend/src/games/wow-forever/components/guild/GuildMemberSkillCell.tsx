import { GUILD_MISSING_VALUE } from "@/games/wow-forever/data/guild/guildConfig";
import { GUILD_NUMBER_CELL } from "@/games/wow-forever/data/guild/guildStyles";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { memberSkill } from "@/games/wow-forever/lib/guild/guildMemberProfessions";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildMemberSkillCellProps {
  member: GuildMember;
  profession: GuideProfession;
}

/** The member's skill in the filtered profession, "225 / 300". */
export default function GuildMemberSkillCell({ member, profession }: GuildMemberSkillCellProps) {
  return <td className={GUILD_NUMBER_CELL}>{memberSkill(member, profession) ?? GUILD_MISSING_VALUE}</td>;
}
