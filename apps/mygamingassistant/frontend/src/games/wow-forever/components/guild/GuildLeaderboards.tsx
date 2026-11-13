import { Swords } from "lucide-react";
import { useId } from "react";
import GuildFactionBoard from "@/games/wow-forever/components/guild/GuildFactionBoard";
import GuildLeaderboardPicker from "@/games/wow-forever/components/guild/GuildLeaderboardPicker";
import GuildStatBoard from "@/games/wow-forever/components/guild/GuildStatBoard";
import { ARENA_HEADING } from "@/games/wow-forever/data/guild/guildHallCopy";
import { HALL_HEADING, HALL_SECTION } from "@/games/wow-forever/data/guild/guildStyles";
import { useLeaderboardParams } from "@/games/wow-forever/hooks/useLeaderboardParams";
import { isFactionBoard } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildLeaderboardsProps {
  slug: string;
  members: readonly GuildMember[];
  /** The gains boards' window (the guild response's ``gains_window_days``). */
  gainsWindowDays: number;
}

/** The Arena, the guild's leaderboards: one board at a time, its top 10 (ties kept), the viewer's own row pinned below. */
export default function GuildLeaderboards({ slug, members, gainsWindowDays }: GuildLeaderboardsProps) {
  const headingId = useId();
  const { board, me, setBoard } = useLeaderboardParams();
  const picker = <GuildLeaderboardPicker board={board} onChange={setBoard} />;

  return (
    <section aria-labelledby={headingId} className={HALL_SECTION}>
      <h2 id={headingId} className={HALL_HEADING}>
        <Swords aria-hidden className="h-5 w-5 text-red-500" />
        {ARENA_HEADING}
      </h2>
      {isFactionBoard(board) ? (
        <GuildFactionBoard slug={slug} members={members} board={board} me={me} picker={picker} />
      ) : (
        <GuildStatBoard members={members} board={board} me={me} gainsWindowDays={gainsWindowDays} picker={picker} />
      )}
    </section>
  );
}
