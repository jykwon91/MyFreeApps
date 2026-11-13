import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import GuildMemberTitles from "@/games/wow-forever/components/guild/GuildMemberTitles";
import GuildMemberStaleNote from "@/games/wow-forever/components/guild/GuildMemberStaleNote";
import { memberSkillText } from "@/games/wow-forever/lib/guild/guildMemberProfessions";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import { rankLabel } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";

interface GuildMemberCardProps {
  member: GuildMember;
  rosterUpdatedAt: string | null;
  /** The member's guild titles; undefined for none. */
  titles: readonly GuildTitle[] | undefined;
  /** The Profession filter: adds the member's skill in it. "" for none. */
  profession: GuideProfession | "";
}

/** One member as a card (narrow screens). */
export default function GuildMemberCard({ member, rosterUpdatedAt, titles, profession }: GuildMemberCardProps) {
  const level = member.level === null ? null : `Level ${member.level}`;
  const itemLevel = member.item_level === null ? null : `item level ${member.item_level}`;
  const skillText = profession ? memberSkillText(member, profession) : null;
  const details = [level, member.class_name, itemLevel, rankLabel(member.rank), skillText].filter((d): d is string => Boolean(d));
  return (
    <li className="rounded-xl border bg-card px-3 pb-2">
      <GuildMemberLink member={member} />
      <GuildMemberTitles titles={titles} />
      <p className="text-sm text-muted-foreground">{details.join(" · ")}</p>
      <GuildMemberStaleNote member={member} rosterUpdatedAt={rosterUpdatedAt} />
    </li>
  );
}
