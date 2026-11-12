import { useEffect, useMemo, type ReactNode } from "react";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import GuildFactionPicker from "@/games/wow-forever/components/guild/GuildFactionPicker";
import GuildLeaderboardList from "@/games/wow-forever/components/guild/GuildLeaderboardList";
import GuildPodiumSkeleton from "@/games/wow-forever/components/guild/GuildPodiumSkeleton";
import { LEADERBOARD_PICKER_GRID } from "@/games/wow-forever/data/guild/guildStyles";
import { useGetGuildReputationsQuery } from "@/games/wow-forever/api/wowGuildApi";
import { LEADERBOARD_COPY } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { useFactionParam } from "@/games/wow-forever/hooks/useFactionParam";
import { topEntries, viewerIsUnranked } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import { factionUnrankedNote, rankStandings, standingStatus } from "@/games/wow-forever/lib/guild/guildStandings";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";

interface GuildFactionBoardProps {
  slug: string;
  members: readonly GuildMember[];
  board: LeaderboardBoard;
  me: string;
  /** The board picker, shown beside the faction picker. */
  picker: ReactNode;
}

/** "One faction's standing": members ranked by their standing with the faction picked (`?faction=`). */
export default function GuildFactionBoard({ slug, members, board, me, picker }: GuildFactionBoardProps) {
  const { faction, setFaction } = useFactionParam();
  // ``data`` keeps the last answer while another faction loads, so the list stays (dimmed) instead of jumping;
  // ``currentData`` is only ever the answer for the faction asked for now.
  const { data, currentData, isFetching, isError, refetch } = useGetGuildReputationsQuery({ slug, faction });

  // A faction nobody has met (an old link) falls back to the default: say so in the URL too.
  useEffect(() => {
    if (faction !== null && currentData && currentData.faction_id !== faction) setFaction(currentData.faction_id);
  }, [faction, currentData, setFaction]);

  const ranked = useMemo(() => (data ? rankStandings(members, data.standings) : []), [members, data]);
  const chosen = data?.factions.find((f) => f.id === data.faction_id) ?? null;
  const unranked = members.length - ranked.length;
  const viewerUnranked = viewerIsUnranked(members, ranked, me);
  const loaded = data !== undefined && !isError;
  const noFactions = loaded && data.factions.length === 0;

  return (
    <div className="space-y-3" aria-busy={isFetching}>
      <div className={LEADERBOARD_PICKER_GRID}>
        {picker}
        {noFactions ? null : (
          <GuildFactionPicker factions={data?.factions ?? null} value={faction ?? data?.faction_id ?? null} onChange={setFaction} />
        )}
      </div>
      {data === undefined && !isError ? (
        <div data-testid="guild-faction-skeleton">
          <GuildPodiumSkeleton />
        </div>
      ) : null}
      {isError ? <LoadErrorRetry message={LEADERBOARD_COPY.faction.problem} onRetry={refetch} retrying={isFetching} /> : null}
      {noFactions ? <p className="rounded-lg border border-dashed p-4 text-sm">{LEADERBOARD_COPY.faction.empty}</p> : null}
      {loaded && chosen ? (
        <div className={isFetching ? "space-y-3 opacity-60 transition-opacity" : "space-y-3 transition-opacity"}>
          <div role="status" aria-live="polite" className="text-sm text-muted-foreground">
            {standingStatus(board.label, chosen.name, topEntries(ranked).length, ranked.length)}
          </div>
          <GuildLeaderboardList
            key={chosen.id}
            ranked={ranked}
            label={`${chosen.name} standing leaderboard`}
            empty={LEADERBOARD_COPY.faction.empty}
            me={me}
            viewerNote={viewerUnranked ? LEADERBOARD_COPY.faction.viewerUnranked(chosen.name) : null}
            showBar={board.showBar}
          />
          {unranked > 0 ? (
            <p className="text-xs text-muted-foreground">{factionUnrankedNote(unranked, chosen.name)}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
