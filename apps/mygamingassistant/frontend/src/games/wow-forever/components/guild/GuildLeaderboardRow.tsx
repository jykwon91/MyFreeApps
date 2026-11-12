import GuildMemberLink from "@/games/wow-forever/components/guild/GuildMemberLink";
import { BADGE } from "@/games/wow-forever/data/badgeStyles";
import { LEADERBOARD_ROW, LEADERBOARD_ROW_MINE } from "@/games/wow-forever/data/guild/guildStyles";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

interface GuildLeaderboardRowProps {
  entry: LeaderboardEntry;
  mine: boolean;
}

/** One ranked member: rank (shared when tied), name, class (and since when, on a gains board), their number; "You" on the viewer's character. */
export default function GuildLeaderboardRow({ entry, mine }: GuildLeaderboardRowProps) {
  // "Mage · since Nov 12" on a gains board; the class alone elsewhere.
  const subline = [entry.member.class_name, entry.detail].filter(Boolean).join(" · ");
  return (
    <li className={mine ? LEADERBOARD_ROW_MINE : LEADERBOARD_ROW}>
      <span className="w-8 shrink-0 text-right font-semibold tabular-nums">
        {entry.rank}
        {entry.tied ? <span className="sr-only"> (tied)</span> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2">
          <GuildMemberLink member={entry.member} />
          {mine ? <span className={BADGE}>You</span> : null}
        </span>
        {subline ? <span className="block truncate text-xs text-muted-foreground">{subline}</span> : null}
      </span>
      <span className="shrink-0 font-medium tabular-nums">{entry.display}</span>
    </li>
  );
}
