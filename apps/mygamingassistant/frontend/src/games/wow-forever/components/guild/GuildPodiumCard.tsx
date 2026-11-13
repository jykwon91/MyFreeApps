import clsx from "clsx";
import { Crown } from "lucide-react";
import GuildLeaderboardBar from "@/games/wow-forever/components/guild/GuildLeaderboardBar";
import GuildLeaderboardName from "@/games/wow-forever/components/guild/GuildLeaderboardName";
import GuildRankMedal from "@/games/wow-forever/components/guild/GuildRankMedal";
import { CHAMPION_RIBBON } from "@/games/wow-forever/data/guild/guildHallCopy";
import {
  LEADERBOARD_MINE,
  PODIUM_CARD,
  PODIUM_CARD_FIRST,
  PODIUM_CARD_OTHER,
  PODIUM_CLASS_TOP,
  PODIUM_RIBBON,
} from "@/games/wow-forever/data/guild/guildStyles";
import { GOLD_BORDER, GOLD_TEXT } from "@/games/wow-forever/data/guild/medalStyles";
import { memberClassStyle } from "@/games/wow-forever/lib/guild/memberClassStyle";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

interface GuildPodiumCardProps {
  entry: LeaderboardEntry;
  mine: boolean;
  /** Where the card stands on wide screens (``PODIUM_SLOTS``). */
  slot: string;
  /** The bar's width against the leader; null on a board without bars. */
  barPercent: number | null;
}

/** A top-3 member's card: a class-coloured top border, a medal (a crown, glow and "Champion" ribbon for 1st), class-coloured name, and their number, large. */
export default function GuildPodiumCard({ entry, mine, slot, barPercent }: GuildPodiumCardProps) {
  const first = entry.rank === 1;
  const classStyle = memberClassStyle(entry.member.class_name);
  return (
    <li
      style={classStyle}
      className={clsx(
        PODIUM_CARD,
        slot,
        first ? [PODIUM_CARD_FIRST, GOLD_BORDER] : PODIUM_CARD_OTHER,
        classStyle && PODIUM_CLASS_TOP,
        mine && LEADERBOARD_MINE,
      )}
    >
      <span className="flex shrink-0 flex-col items-center">
        {first ? <Crown aria-hidden className={clsx("h-5 w-5", GOLD_TEXT)} /> : null}
        <GuildRankMedal rank={entry.rank} tied={entry.tied} size="podium" />
      </span>
      <span className="min-w-0 flex-1 sm:w-full sm:flex-none">
        <GuildLeaderboardName entry={entry} mine={mine} centered />
      </span>
      <span className="shrink-0 text-2xl font-bold tabular-nums">{entry.display}</span>
      {barPercent === null ? null : (
        <span className="block basis-full sm:w-full sm:basis-auto">
          <GuildLeaderboardBar percent={barPercent} />
        </span>
      )}
      {first ? <span className={PODIUM_RIBBON}>{CHAMPION_RIBBON}</span> : null}
    </li>
  );
}
