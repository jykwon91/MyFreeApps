import GuildMemberCard from "@/games/wow-forever/components/guild/GuildMemberCard";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";

interface GuildMemberCardsProps {
  members: readonly GuildMember[];
  rosterUpdatedAt: string | null;
  /** Each member's guild titles, by slug. */
  titles: ReadonlyMap<string, readonly GuildTitle[]>;
  /** The Profession filter; "" for none. */
  profession: GuideProfession | "";
}

/** The member list as cards (narrow screens). */
export default function GuildMemberCards({ members, rosterUpdatedAt, titles, profession }: GuildMemberCardsProps) {
  return (
    <ul className="md:hidden space-y-2" aria-label="Guild members">
      {members.map((m) => (
        <GuildMemberCard key={m.slug} member={m} rosterUpdatedAt={rosterUpdatedAt} titles={titles.get(m.slug)} profession={profession} />
      ))}
    </ul>
  );
}
