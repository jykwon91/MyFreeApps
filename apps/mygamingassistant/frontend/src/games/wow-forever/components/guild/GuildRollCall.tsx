import { ChevronDown } from "lucide-react";
import GuildMembersSection from "@/games/wow-forever/components/guild/GuildMembersSection";
import { ROLL_CALL_COPY } from "@/games/wow-forever/data/guild/guildHallCopy";
import { ROLL_CALL_SECTION } from "@/games/wow-forever/data/guild/guildStyles";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";

interface GuildRollCallProps {
  members: readonly GuildMember[];
  rosterUpdatedAt: string | null;
  /** Each member's guild titles, by slug. */
  titles: ReadonlyMap<string, readonly GuildTitle[]>;
}

/** "Roll call (N)": the member table and cards under a heading that folds them away. Open to start with. */
export default function GuildRollCall({ members, rosterUpdatedAt, titles }: GuildRollCallProps) {
  return (
    <details open className={ROLL_CALL_SECTION}>
      <summary className="flex min-h-[44px] list-none items-center justify-between gap-2 text-lg font-bold [&::-webkit-details-marker]:hidden">
        {ROLL_CALL_COPY.heading(members.length)}
        <ChevronDown aria-hidden className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="space-y-4">
        <GuildMembersSection members={members} rosterUpdatedAt={rosterUpdatedAt} titles={titles} />
      </div>
    </details>
  );
}
