import { useId, useMemo, useState } from "react";
import { Button } from "@platform/ui";
import GuildLeaderboardPicker from "@/games/wow-forever/components/guild/GuildLeaderboardPicker";
import GuildLeaderboardRow from "@/games/wow-forever/components/guild/GuildLeaderboardRow";
import { useLeaderboardParams } from "@/games/wow-forever/hooks/useLeaderboardParams";
import { formatCount } from "@/games/wow-forever/lib/character/formatCount";
import { LEADERBOARD_COPY } from "@/games/wow-forever/data/guild/leaderboardConfig";
import {
  boardStatus,
  gainsNote,
  isGainBoard,
  levelCapCount,
  missingCount,
  noBaselineCount,
  noGainCount,
  rankBoard,
  topEntries,
} from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

interface GuildLeaderboardsProps {
  members: readonly GuildMember[];
  /** The gains boards' window (the guild response's ``gains_window_days``). */
  gainsWindowDays: number;
}

/** The guild's leaderboards: one board at a time, its top 10 (ties kept), the viewer's own row pinned below. */
export default function GuildLeaderboards({ members, gainsWindowDays }: GuildLeaderboardsProps) {
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
  const gains = isGainBoard(board);
  const noGain = noGainCount(members, board);
  const noBaseline = noBaselineCount(members, board);

  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-xl border bg-card/50 p-3 sm:p-4">
      <h2 id={headingId} className="text-lg font-semibold">
        Leaderboards
      </h2>
      <GuildLeaderboardPicker board={board} onChange={setBoard} />
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {boardStatus(board, shown.length, ranked.length, atCap)}
      </div>
      {gains ? <p className="text-xs text-muted-foreground">{gainsNote(gainsWindowDays)}</p> : null}
      {ranked.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm">
          {gains
            ? LEADERBOARD_COPY.gains.empty
            : `Nobody in the guild has a number for ${board.label} yet. It fills in as members' characters are looked up.`}
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
        <p className="text-sm text-muted-foreground">
          {gains ? LEADERBOARD_COPY.gains.viewerUnranked : LEADERBOARD_COPY.other.viewerUnranked}
        </p>
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
      {noGain > 0 ? (
        <p className="text-xs text-muted-foreground">
          {formatCount(noGain, "member", "members")} had no gain, so they&apos;re not ranked.
        </p>
      ) : null}
      {noBaseline > 0 ? (
        <p className="text-xs text-muted-foreground">
          {formatCount(noBaseline, "member needs", "members need")} a second lookup on another day to show a gain.
        </p>
      ) : null}
      {missing > 0 ? (
        <p className="text-xs text-muted-foreground">
          {formatCount(missing, "member has", "members have")} no number for this yet, so they&apos;re not ranked.
        </p>
      ) : null}
    </section>
  );
}
