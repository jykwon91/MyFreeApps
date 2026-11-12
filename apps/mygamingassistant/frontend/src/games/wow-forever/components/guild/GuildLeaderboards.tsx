import { useId } from "react";
import GuildFactionBoard from "@/games/wow-forever/components/guild/GuildFactionBoard";
import GuildLeaderboardPicker from "@/games/wow-forever/components/guild/GuildLeaderboardPicker";
import GuildStatBoard from "@/games/wow-forever/components/guild/GuildStatBoard";
import { useLeaderboardParams } from "@/games/wow-forever/hooks/useLeaderboardParams";
import { isFactionBoard } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildLeaderboardsProps {
  slug: string;
  members: readonly GuildMember[];
  /** The gains boards' window (the guild response's ``gains_window_days``). */
  gainsWindowDays: number;
}

/** The guild's leaderboards: one board at a time, its top 10 (ties kept), the viewer's own row pinned below. */
export default function GuildLeaderboards({ slug, members, gainsWindowDays }: GuildLeaderboardsProps) {
  const headingId = useId();
  const { board, me, setBoard } = useLeaderboardParams();
  const picker = <GuildLeaderboardPicker board={board} onChange={setBoard} />;

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border bg-card/50 p-3 sm:p-4">
      <h2 id={headingId} className="text-lg font-semibold">
        Leaderboards
      </h2>
      {isFactionBoard(board) ? (
        <GuildFactionBoard slug={slug} members={members} board={board} me={me} picker={picker} />
      ) : (
        <GuildStatBoard members={members} board={board} me={me} gainsWindowDays={gainsWindowDays} picker={picker} />
      )}
    </section>
  );
}
