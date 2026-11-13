import clsx from "clsx";
import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import { BADGE } from "@/games/wow-forever/data/badgeStyles";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

interface GuildLeaderboardNameProps {
  entry: LeaderboardEntry;
  mine: boolean;
  /** Centred on wide screens (a podium card). */
  centered: boolean;
}

/** A ranked member's name in their class colour, "You" on the viewer's, and the class (and progress or since when) under it. */
export default function GuildLeaderboardName({ entry, mine, centered }: GuildLeaderboardNameProps) {
  // "Mage · since Nov 12" on a gains board, "Mage · 6,550 / 12,000" on a standing; the class alone elsewhere.
  const subline = [entry.member.class_name, entry.detail].filter(Boolean).join(" · ");
  return (
    <span className="block min-w-0">
      <span className={clsx("flex flex-wrap items-center gap-x-2", centered && "sm:justify-center")}>
        <GuildMemberLink member={entry.member} />
        {mine ? <span className={BADGE}>You</span> : null}
      </span>
      {subline ? <span className="block truncate text-xs text-muted-foreground">{subline}</span> : null}
    </span>
  );
}
