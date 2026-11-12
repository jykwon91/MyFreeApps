import { useId, useMemo, useState } from "react";
import { Button } from "@platform/ui";
import GuildLeaderboardPicker from "@/games/wow-forever/components/guild/GuildLeaderboardPicker";
import GuildLeaderboardRow from "@/games/wow-forever/components/guild/GuildLeaderboardRow";
import { useLeaderboardParams } from "@/games/wow-forever/hooks/useLeaderboardParams";
import { formatCount } from "@/games/wow-forever/lib/character/formatCount";
import { boardStatus, levelCapCount, missingCount, rankBoard, topEntries } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

/** The guild's leaderboards: one board at a time, its top 10 (ties kept), the viewer's own row pinned below. */
export default function GuildLeaderboards({ members }: { members: readonly GuildMember[] }) {
  const headingId = useId();
  const { board, me, setBoard } = useLeaderboardParams();
  const [expandedBoard, setExpandedBoard] = useState<string | null>(null);
  const expanded = expandedBoard === board.id;

  const ranked = useMemo(() => rankBoard(members, board), [members, board]);
  const top = useMemo(() => topEntries(ranked), [ranked]);
  const shown = expanded ? ranked : top;
  const mine = ranked.find((e) => e.member.slug === me);
  const pinned = mine && !shown.includes(mine) ? mine : null;
  const viewerUnranked = !mine && members.some((m) => m.slug === me);
  const missing = missingCount(members, board, ranked.length);
  const atCap = levelCapCount(members, board);

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border bg-card/50 p-3 sm:p-4">
      <h2 id={headingId} className="text-lg font-semibold">
        Leaderboards
      </h2>
      <GuildLeaderboardPicker board={board} onChange={setBoard} />
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {boardStatus(board, shown.length, ranked.length, atCap)}
      </div>
      {ranked.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm">
          Nobody in the guild has a number for {board.label} yet. It fills in as members&apos; characters are looked up.
        </p>
      ) : (
        <ol className="space-y-1" aria-label={`${board.label} leaderboard`}>
          {shown.map((entry) => (
            <GuildLeaderboardRow key={entry.member.slug} entry={entry} mine={entry.member.slug === me} />
          ))}
        </ol>
      )}
      {pinned ? (
        <ol className="space-y-1 border-t pt-2" aria-label="Your character">
          <GuildLeaderboardRow entry={pinned} mine />
        </ol>
      ) : null}
      {viewerUnranked ? (
        <p className="text-sm text-muted-foreground">Your character isn&apos;t on this board: we have no number for them here.</p>
      ) : null}
      {ranked.length > top.length ? (
        <Button
          variant="secondary"
          size="sm"
          className="min-h-[44px]"
          aria-expanded={expanded}
          onClick={() => setExpandedBoard(expanded ? null : board.id)}
        >
          {expanded ? "Show top 10" : `Show all ${ranked.length}`}
        </Button>
      ) : null}
      {missing > 0 ? (
        <p className="text-xs text-muted-foreground">
          {formatCount(missing, "member has", "members have")} no number for this yet, so they&apos;re not ranked.
        </p>
      ) : null}
    </section>
  );
}
