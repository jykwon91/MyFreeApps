import { Users } from "lucide-react";
import { useId } from "react";
import GuildMembersSection from "@/games/wow-forever/components/guild/GuildMembersSection";
import { ROLL_CALL_COPY } from "@/games/wow-forever/data/guild/guildHallCopy";
import { HALL_HEADING, HALL_SECTION } from "@/games/wow-forever/data/guild/guildStyles";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";

interface GuildRollCallProps {
  members: readonly GuildMember[];
  rosterUpdatedAt: string | null;
  /** Each member's guild titles, by slug. */
  titles: ReadonlyMap<string, readonly GuildTitle[]>;
}

/** "Roll call (N)": the member table and cards, the Roster tab's whole page. */
export default function GuildRollCall({ members, rosterUpdatedAt, titles }: GuildRollCallProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={HALL_SECTION}>
      <h2 id={headingId} className={HALL_HEADING}>
        <Users aria-hidden className="h-5 w-5 text-primary" />
        {ROLL_CALL_COPY.heading(members.length)}
      </h2>
      <GuildMembersSection members={members} rosterUpdatedAt={rosterUpdatedAt} titles={titles} />
    </section>
  );
}
