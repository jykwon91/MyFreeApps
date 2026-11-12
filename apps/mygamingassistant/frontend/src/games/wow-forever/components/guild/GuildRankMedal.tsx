import clsx from "clsx";
import { MEDAL_SIZE, MEDAL_STYLES, RANK_BADGE } from "@/games/wow-forever/data/guild/medalStyles";
import { ordinal } from "@/games/wow-forever/lib/guild/ordinal";

interface GuildRankMedalProps {
  rank: number;
  tied: boolean;
  size: keyof typeof MEDAL_SIZE;
}

/** A rank as a medal (gold, silver, bronze for 1-3, a plain badge after); screen readers hear "2nd place (tied)". */
export default function GuildRankMedal({ rank, tied, size }: GuildRankMedalProps) {
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold tabular-nums ring-2",
        MEDAL_SIZE[size],
        MEDAL_STYLES[rank] ?? RANK_BADGE,
      )}
    >
      <span aria-hidden>{rank}</span>
      <span className="sr-only">
        {ordinal(rank)} place{tied ? " (tied)" : ""}
      </span>
    </span>
  );
}
