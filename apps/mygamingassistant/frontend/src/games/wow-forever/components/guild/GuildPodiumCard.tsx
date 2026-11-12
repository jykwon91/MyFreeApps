import clsx from "clsx";
import { Crown } from "lucide-react";
import GuildLeaderboardBar from "@/games/wow-forever/components/guild/GuildLeaderboardBar";
import GuildLeaderboardName from "@/games/wow-forever/components/guild/GuildLeaderboardName";
import GuildRankMedal from "@/games/wow-forever/components/guild/GuildRankMedal";
import {
  LEADERBOARD_MINE,
  PODIUM_CARD,
  PODIUM_CARD_FIRST,
  PODIUM_CARD_OTHER,
} from "@/games/wow-forever/data/guild/guildStyles";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

interface GuildPodiumCardProps {
  entry: LeaderboardEntry;
  mine: boolean;
  /** Where the card stands on wide screens (``PODIUM_SLOTS``). */
  slot: string;
  /** The bar's width against the leader; null on a board without bars. */
  barPercent: number | null;
}

/** A top-3 member's card: a medal (with a crown for 1st), class-coloured name, and their number, large. */
export default function GuildPodiumCard({ entry, mine, slot, barPercent }: GuildPodiumCardProps) {
  const first = entry.rank === 1;
  return (
    <li className={clsx(PODIUM_CARD, slot, first ? PODIUM_CARD_FIRST : PODIUM_CARD_OTHER, mine && LEADERBOARD_MINE)}>
      <span className="flex shrink-0 flex-col items-center">
        {first ? <Crown aria-hidden className="h-5 w-5 text-[#B8902A]" /> : null}
        <GuildRankMedal rank={entry.rank} tied={entry.tied} size="podium" />
      </span>
      <span className="min-w-0 flex-1 sm:w-full sm:flex-none">
        <GuildLeaderboardName entry={entry} mine={mine} centered />
      </span>
      <span className="shrink-0 text-2xl font-bold tabular-nums">{entry.display}</span>
      {barPercent === null ? null : (
        <span className="hidden w-full sm:block">
          <GuildLeaderboardBar percent={barPercent} />
        </span>
      )}
    </li>
  );
}
