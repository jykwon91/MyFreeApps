import GuildMemberCard from "@/games/wow-forever/components/guild/GuildMemberCard";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildMemberCardsProps {
  members: readonly GuildMember[];
  rosterUpdatedAt: string | null;
}

/** The member list as cards (narrow screens). */
export default function GuildMemberCards({ members, rosterUpdatedAt }: GuildMemberCardsProps) {
  return (
    <ul className="md:hidden space-y-2" aria-label="Guild members">
      {members.map((m) => (
        <GuildMemberCard key={m.slug} member={m} rosterUpdatedAt={rosterUpdatedAt} />
      ))}
    </ul>
  );
}
