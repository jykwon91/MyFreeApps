import { LEADERBOARDS } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { heroHint } from "@/games/wow-forever/lib/guild/guildChase";
import { isGainBoard, rankBoard } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import type { BoardHero } from "@/games/wow-forever/types/guild/boardHero";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";

/** The leader of each gains board that has anyone on it, in board order, with the hint about who's chasing them. */
export function weeklyHeroes(members: readonly GuildMember[]): BoardHero[] {
  const heroes: BoardHero[] = [];
  for (const board of LEADERBOARDS.filter(isGainBoard)) {
    const [leader, runnerUp = null] = rankBoard(members, board);
    if (!leader) continue;
    heroes.push({ board, leader, runnerUp, hint: heroHint(board.id, leader, runnerUp) });
  }
  return heroes;
}
