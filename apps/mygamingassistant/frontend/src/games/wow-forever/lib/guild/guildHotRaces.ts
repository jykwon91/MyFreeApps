import { HOT_RACE_MAX_RELATIVE_GAP, HOT_RACES_SHOWN } from "@/games/wow-forever/data/guild/guildHallCopy";
import { LEADERBOARDS } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { entryGap } from "@/games/wow-forever/lib/guild/guildChase";
import { rankBoard } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import { leadersQualify } from "@/games/wow-forever/lib/guild/guildTitles";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { HotRace } from "@/games/wow-forever/types/guild/hotRace";

/**
 * The boards where 1st and 2nd are closest, as a share of the larger number: 3 HKs in 4,000 beats 3 in 30.
 * A dead heat isn't a race (both lead), a board whose lead wouldn't earn a title (nobody above 0) isn't one, and
 * neither is a runner-up under half the leader's number. Closest first, board order breaking ties.
 */
export function hotRaces(members: readonly GuildMember[], limit: number = HOT_RACES_SHOWN): HotRace[] {
  const races: HotRace[] = [];
  for (const board of LEADERBOARDS) {
    const [leader, runnerUp] = rankBoard(members, board);
    if (!leader || !runnerUp || leader.rank !== 1 || runnerUp.rank === 1) continue;
    if (!leadersQualify(board, leader.value)) continue;
    const gap = entryGap(leader, runnerUp);
    // The floor of 1 keeps a 0-vs-1 race (e.g. fewest deaths) from dividing by zero; it counts as a 100% gap, so not hot.
    const relativeGap = gap / Math.max(Math.abs(leader.value), Math.abs(runnerUp.value), 1);
    if (gap === 0 || relativeGap > HOT_RACE_MAX_RELATIVE_GAP) continue;
    races.push({ board, leader, runnerUp, gap, relativeGap });
  }
  return races.sort((a, b) => a.relativeGap - b.relativeGap).slice(0, limit);
}
