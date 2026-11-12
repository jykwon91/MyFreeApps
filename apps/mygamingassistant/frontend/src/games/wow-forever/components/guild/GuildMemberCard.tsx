import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import GuildMemberStaleNote from "@/games/wow-forever/components/guild/GuildMemberStaleNote";
import { rankLabel } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildMemberCardProps {
  member: GuildMember;
  rosterUpdatedAt: string | null;
}

/** One member as a card (narrow screens). */
export default function GuildMemberCard({ member, rosterUpdatedAt }: GuildMemberCardProps) {
  const level = member.level === null ? null : `Level ${member.level}`;
  const itemLevel = member.item_level === null ? null : `item level ${member.item_level}`;
  const details = [level, member.class_name, itemLevel, rankLabel(member.rank)].filter((d): d is string => Boolean(d));
  return (
    <li className="rounded-xl border bg-card px-3 pb-2">
      <GuildMemberLink member={member} />
      <p className="text-sm text-muted-foreground">{details.join(" · ")}</p>
      <GuildMemberStaleNote member={member} rosterUpdatedAt={rosterUpdatedAt} />
    </li>
  );
}
