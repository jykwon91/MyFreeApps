import { QUESTS_COPY, QUESTS_SHOWN } from "@/games/wow-forever/data/guild/guildHallCopy";
import { LEADERBOARDS } from "@/games/wow-forever/data/guild/leaderboardConfig";
import { moreUnits, unitCount } from "@/games/wow-forever/lib/guild/guildChase";
import { rankBoard } from "@/games/wow-forever/lib/guild/guildLeaderboards";
import { memberFullName } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildQuest } from "@/games/wow-forever/types/guild/guildQuest";
import type { GuildTitle } from "@/games/wow-forever/types/guild/guildTitle";
import type { GuildTitles } from "@/games/wow-forever/types/guild/guildTitles";
import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

/** "Rathgar", or "Rathgar and 2 others" when the lead is shared. */
function holderLabel(title: GuildTitle): string {
  const [first, ...rest] = title.holders;
  return memberFullName(first) + (rest.length > 0 ? QUESTS_COPY.others(rest.length) : "");
}

/**
 * What it takes to beat the leader: more of the number (one past it, since a tie shares the title), or on a
 * fewest-first board, where the number only grows, the leader slipping.
 */
function questText(board: LeaderboardBoard, title: GuildTitle, distance: number): string {
  if (board.ascending) return QUESTS_COPY.wait(holderLabel(title), unitCount(board.id, distance), title.title);
  return QUESTS_COPY.take(moreUnits(board.id, distance + 1), title.title, holderLabel(title));
}

function questFor(title: GuildTitle, ranked: readonly LeaderboardEntry[], board: LeaderboardBoard, me: string): GuildQuest | null {
  const mine = ranked.find((e) => e.member.slug === me);
  if (!mine || mine.rank === 1) return null;
  const leader = ranked[0];
  const distance = board.ascending ? mine.value - leader.value : leader.value - mine.value;
  if (distance <= 0) return null;
  const relativeGap = distance / Math.max(Math.abs(leader.value), Math.abs(mine.value), 1);
  return { title, text: questText(board, title, distance), relativeGap };
}

/**
 * The titles the viewer (`?me=`) is closest to taking, closest first: for each awarded title they don't hold and
 * are ranked on, how far they are from its holders as a share of the larger number. [] without a viewer.
 */
export function myQuests(members: readonly GuildMember[], titles: GuildTitles, me: string, limit: number = QUESTS_SHOWN): GuildQuest[] {
  if (!me) return [];
  const quests: GuildQuest[] = [];
  for (const title of titles.awarded) {
    const board = LEADERBOARDS.find((b) => b.id === title.boardId);
    if (!board || title.holders.some((h) => h.slug === me)) continue;
    const quest = questFor(title, rankBoard(members, board), board, me);
    if (quest) quests.push(quest);
  }
  return quests.sort((a, b) => a.relativeGap - b.relativeGap).slice(0, limit);
}
