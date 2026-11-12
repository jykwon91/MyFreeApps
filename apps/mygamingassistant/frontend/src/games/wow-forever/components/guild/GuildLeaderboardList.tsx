import { useState } from "react";
import { Button } from "@platform/ui";
import GuildLeaderboardRow from "@/games/wow-forever/components/guild/GuildLeaderboardRow";
import GuildPodiumCard from "@/games/wow-forever/components/guild/GuildPodiumCard";
import { PODIUM_SLOTS } from "@/games/wow-forever/data/guild/guildStyles";
import { barPercent } from "@/games/wow-forever/lib/guild/leaderboardBar";
import { topEntries } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import { splitPodium } from "@/games/wow-forever/lib/guild/splitPodium";
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
  /** Rows show a bar against the leader's number. */
  showBar: boolean;
}

/**
 * A board: the top 3 on a podium (1st in the middle on wide screens, stacked on a phone), then the rest of its top 10
 * (ties kept) or all of them as rows, the viewer's own row pinned below when it's out of view; ``empty`` when nobody is
 * ranked. One list in reading order (1st, 2nd, 3rd…): the podium's order is only visual. Give it a ``key`` per board
 * so "Show all" resets when the board changes.
 */
export default function GuildLeaderboardList({ ranked, label, empty, me, viewerNote, showBar }: GuildLeaderboardListProps) {
  const [expanded, setExpanded] = useState(false);
  const top = topEntries(ranked);
  const shown = expanded ? ranked : top;
  const { podium, rest } = splitPodium(shown);
  const mine = ranked.find((e) => e.member.slug === me);
  const pinned = mine && !shown.includes(mine) ? mine : null;
  const leader = ranked[0]?.value ?? 0;
  const bar = (entry: LeaderboardEntry) => (showBar ? barPercent(entry.value, leader) : null);

  return (
    <>
      {ranked.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm">{empty}</p>
      ) : (
        <ol className="grid grid-cols-1 gap-2 sm:grid-flow-row-dense sm:grid-cols-3 sm:items-end" aria-label={label}>
          {podium.map((entry, i) => (
            <GuildPodiumCard
              key={entry.member.slug}
              entry={entry}
              mine={entry.member.slug === me}
              slot={PODIUM_SLOTS[i]}
              barPercent={bar(entry)}
            />
          ))}
          {rest.map((entry) => (
            <GuildLeaderboardRow key={entry.member.slug} entry={entry} mine={entry.member.slug === me} barPercent={bar(entry)} />
          ))}
        </ol>
      )}
      {pinned ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <span aria-hidden>…</span>
            <span>Your rank</span>
            <span aria-hidden className="h-px flex-1 bg-border" />
          </div>
          <ol aria-label="Your character">
            <GuildLeaderboardRow entry={pinned} mine barPercent={bar(pinned)} />
          </ol>
        </div>
      ) : null}
      {viewerNote ? <p className="rounded-md border bg-[hsl(var(--muted)/0.4)] p-3 text-sm text-muted-foreground">{viewerNote}</p> : null}
      {ranked.length > top.length ? (
        <Button
          variant="secondary"
          size="sm"
          className="min-h-[44px] w-full sm:w-auto"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show top 10" : `Show all ${ranked.length}`}
        </Button>
      ) : null}
    </>
  );
}
