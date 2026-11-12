import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import {
  GUILD_STAT_FIELDS,
  LEADERBOARD_SOURCE_KIND,
  LEADERBOARD_TIE_LIMIT,
  LEADERBOARD_TOP,
  LEADERBOARDS,
} from "@/games/wow-forever/data/guild/leaderboardConfig";
import { formatCount } from "@/games/wow-forever/lib/character/formatCount";
import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";
import { memberFullName } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";

/** The boards grouped for the picker, groups in first-seen order. */
export function boardGroups(): [string, LeaderboardBoard[]][] {
  const groups = new Map<string, LeaderboardBoard[]>();
  for (const board of LEADERBOARDS) {
    const group = groups.get(board.group);
    if (group) group.push(board);
    else groups.set(board.group, [board]);
  }
  return [...groups];
}

/** The board a `?board=` value names; the first board for a missing or unknown one. */
export function findBoard(id: string | null): LeaderboardBoard {
  return LEADERBOARDS.find((board) => board.id === id) ?? LEADERBOARDS[0];
}

/** The members a board ranks at all: everyone, or only those at the level cap. */
export function boardCandidates(members: readonly GuildMember[], board: LeaderboardBoard): GuildMember[] {
  if (!board.maxLevelOnly) return [...members];
  return members.filter((m) => m.level === MAX_LEVEL);
}

/** The member's entry on a board before ranking, or null when we have no number for them (never ranked as 0). */
function unranked(member: GuildMember, board: LeaderboardBoard): Omit<LeaderboardEntry, "rank" | "tied"> | null {
  const source = board.source;
  if (source.kind === LEADERBOARD_SOURCE_KIND.stat) {
    const value = member[source.field];
    if (value === null) return null;
    return { member, value, display: formatWhole(value) };
  }
  const skill = member.professions.find((p) => p.id === source.professionId);
  if (!skill) return null;
  return { member, value: skill.skill, display: `${skill.skill} / ${skill.max_skill}` };
}

/** Every member with a number on the board, best first; ties share a rank (1, 2, 2, 4) and read by name. */
export function rankBoard(members: readonly GuildMember[], board: LeaderboardBoard): LeaderboardEntry[] {
  const sign = board.ascending ? 1 : -1;
  const scored = boardCandidates(members, board)
    .map((m) => unranked(m, board))
    .filter((e) => e !== null)
    .sort((a, b) => sign * (a.value - b.value) || memberFullName(a.member).localeCompare(memberFullName(b.member)));
  let rank = 0;
  return scored.map((entry, i) => {
    if (i === 0 || scored[i - 1].value !== entry.value) rank = i + 1;
    const tied = scored[i - 1]?.value === entry.value || scored[i + 1]?.value === entry.value;
    return { ...entry, rank, tied };
  });
}

/**
 * The top of a board: every entry ranked within the top N, so a tie at the cut
 * keeps everyone tied — unless that runs past ``LEADERBOARD_TIE_LIMIT`` rows
 * (most of a big guild at 60), when it's the first N and "Show all".
 */
export function topEntries(entries: readonly LeaderboardEntry[]): LeaderboardEntry[] {
  const top = entries.filter((e) => e.rank <= LEADERBOARD_TOP);
  if (top.length > LEADERBOARD_TIE_LIMIT) return top.slice(0, LEADERBOARD_TOP);
  return top;
}

/** The line above a board: "Level: 10 of 31 shown · 12 members at 60". */
export function boardStatus(board: LeaderboardBoard, shown: number, ranked: number, atCap: number): string {
  const parts = [ranked === 0 ? `${board.label}: nobody yet` : `${board.label}: ${shown} of ${ranked} shown`];
  if (board.maxLevelOnly) parts.push(`level ${MAX_LEVEL} characters only`);
  if (atCap > 0) parts.push(`${formatCount(atCap, "member", "members")} at ${MAX_LEVEL}`);
  return parts.join(" · ");
}

/** How many members a board can rank but has no number for. Profession boards: not learned isn't missing data. */
export function missingCount(members: readonly GuildMember[], board: LeaderboardBoard, ranked: number): number {
  if (board.source.kind === LEADERBOARD_SOURCE_KIND.profession) return 0;
  return boardCandidates(members, board).length - ranked;
}

/** On the level board, how many members are at the cap (once most are, the board is one big tie); 0 elsewhere. */
export function levelCapCount(members: readonly GuildMember[], board: LeaderboardBoard): number {
  const source = board.source;
  if (source.kind !== LEADERBOARD_SOURCE_KIND.stat || source.field !== GUILD_STAT_FIELDS.level) return 0;
  return members.filter((m) => m.level === MAX_LEVEL).length;
}
