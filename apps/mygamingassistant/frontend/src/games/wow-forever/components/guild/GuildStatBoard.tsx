import { useMemo, type ReactNode } from "react";
import GuildLeaderboardList from "@/games/wow-forever/components/guild/GuildLeaderboardList";
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
  viewerIsUnranked,
} from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";

interface GuildStatBoardProps {
  members: readonly GuildMember[];
  board: LeaderboardBoard;
  me: string;
  /** The gains boards' window (the guild response's ``gains_window_days``). */
  gainsWindowDays: number;
  /** The board picker, shown above the board. */
  picker: ReactNode;
}

/** A board ranked from the guild response's members: a stat, a gain, or a profession's skill. */
export default function GuildStatBoard({ members, board, me, gainsWindowDays, picker }: GuildStatBoardProps) {
  const ranked = useMemo(() => rankBoard(members, board), [members, board]);
  const shownCount = topEntries(ranked).length;
  const viewerUnranked = viewerIsUnranked(members, ranked, me);
  const missing = missingCount(members, board, ranked.length);
  const atCap = levelCapCount(members, board);
  const gains = isGainBoard(board);
  const noGain = noGainCount(members, board);
  const noBaseline = noBaselineCount(members, board);
  const copy = gains ? LEADERBOARD_COPY.gains : LEADERBOARD_COPY.other;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">{picker}</div>
      <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {boardStatus(board, shownCount, ranked.length, atCap)}
      </div>
      {gains ? <p className="text-xs text-muted-foreground">{gainsNote(gainsWindowDays)}</p> : null}
      <GuildLeaderboardList
        key={board.id}
        ranked={ranked}
        label={`${board.label} leaderboard`}
        empty={gains ? LEADERBOARD_COPY.gains.empty : LEADERBOARD_COPY.other.empty(board.label)}
        me={me}
        viewerNote={viewerUnranked ? copy.viewerUnranked : null}
        showBar={board.showBar}
      />
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
    </>
  );
}
