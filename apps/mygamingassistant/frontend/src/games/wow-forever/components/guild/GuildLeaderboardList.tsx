import { useState } from "react";
import { Button } from "@platform/ui";
import GuildLeaderboardRow from "@/games/wow-forever/components/guild/GuildLeaderboardRow";
import { topEntries } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

interface GuildLeaderboardListProps {
  /** Every ranked entry, best first. */
  ranked: readonly LeaderboardEntry[];
  /** The list's accessible name ("Level leaderboard"). */
  label: string;
  /** Shown in place of the list when nobody is ranked. */
  empty: string;
  /** The highlighted character's slug; "" for none. */
  me: string;
  /** Why the viewer's character isn't ranked, when it's in the guild but not on the board; null otherwise. */
  viewerNote: string | null;
}

/**
 * A board's rows: its top 10 (ties kept) or all of them, the viewer's own row
 * pinned below when it's out of view; ``empty`` when nobody is ranked. Give it a ``key`` per board so "Show all"
 * resets when the board changes.
 */
export default function GuildLeaderboardList({ ranked, label, empty, me, viewerNote }: GuildLeaderboardListProps) {
  const [expanded, setExpanded] = useState(false);
  const top = topEntries(ranked);
  const shown = expanded ? ranked : top;
  const mine = ranked.find((e) => e.member.slug === me);
  const pinned = mine && !shown.includes(mine) ? mine : null;

  return (
    <>
      {ranked.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm">{empty}</p>
      ) : (
        <ol className="space-y-1" aria-label={label}>
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
      {viewerNote ? <p className="text-sm text-muted-foreground">{viewerNote}</p> : null}
      {ranked.length > top.length ? (
        <Button
          variant="secondary"
          size="sm"
          className="min-h-[44px]"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show top 10" : `Show all ${ranked.length}`}
        </Button>
      ) : null}
    </>
  );
}
