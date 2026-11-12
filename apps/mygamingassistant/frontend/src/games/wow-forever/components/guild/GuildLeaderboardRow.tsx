import clsx from "clsx";
import GuildLeaderboardBar from "@/games/wow-forever/components/guild/GuildLeaderboardBar";
import GuildLeaderboardName from "@/games/wow-forever/components/guild/GuildLeaderboardName";
import GuildRankMedal from "@/games/wow-forever/components/guild/GuildRankMedal";
import { LEADERBOARD_MINE, LEADERBOARD_ROW } from "@/games/wow-forever/data/guild/guildStyles";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

interface GuildLeaderboardRowProps {
  entry: LeaderboardEntry;
  mine: boolean;
  /** The bar's width against the leader; null on a board without bars. */
  barPercent: number | null;
}

/** One ranked member below the podium: rank badge, class-coloured name, their number, and a bar against the leader. */
export default function GuildLeaderboardRow({ entry, mine, barPercent }: GuildLeaderboardRowProps) {
  return (
    <li className={clsx(LEADERBOARD_ROW, mine && LEADERBOARD_MINE)}>
      <span className="flex w-10 shrink-0 justify-center">
        <GuildRankMedal rank={entry.rank} tied={entry.tied} size="row" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <GuildLeaderboardName entry={entry} mine={mine} centered={false} />
        {barPercent === null ? null : <GuildLeaderboardBar percent={barPercent} />}
      </span>
      <span className="shrink-0 text-base font-bold tabular-nums">{entry.display}</span>
    </li>
  );
}
