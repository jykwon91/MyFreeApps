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
import { formatShortDay } from "@/games/wow-forever/lib/guild/formatShortDay";
import { memberFullName } from "@/games/wow-forever/lib/guild/guildMembers";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { LeaderboardBoard } from "@/games/wow-forever/types/guild/leaderboardBoard";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";
import type { MemberGain } from "@/games/wow-forever/types/guild/memberGain";

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

/** Whether a board ranks how much a stat grew. */
export function isGainBoard(board: LeaderboardBoard): boolean {
  return board.source.kind === LEADERBOARD_SOURCE_KIND.gain;
}

/** How much the board's stat grew since the member's baseline (never below 0), or null when there's nothing to compare. */
function gainOf(member: GuildMember, board: LeaderboardBoard): MemberGain | null {
  const source = board.source;
  if (source.kind !== LEADERBOARD_SOURCE_KIND.gain || !member.baseline) return null;
  const now = member[source.field];
  const then = member.baseline[source.field];
  if (now === null || then === null) return null;
  return { value: Math.max(0, now - then), since: member.baseline.day };
}

/** The member's entry on a board before ranking, or null when we have no number for them (never ranked as 0). */
function unranked(member: GuildMember, board: LeaderboardBoard): Omit<LeaderboardEntry, "rank" | "tied"> | null {
  const source = board.source;
  if (source.kind === LEADERBOARD_SOURCE_KIND.stat) {
    const value = member[source.field];
    if (value === null) return null;
    return { member, value, display: formatWhole(value), detail: null };
  }
  if (source.kind === LEADERBOARD_SOURCE_KIND.gain) {
    const gained = gainOf(member, board);
    // No gain isn't ranked: a page of "+0" ties says nothing (noGainCount counts them).
    if (gained === null || gained.value === 0) return null;
    return {
      member, value: gained.value, display: `+${formatWhole(gained.value)}`, detail: `since ${formatShortDay(gained.since)}`,
    };
  }
  // Standings aren't on the member: the faction board ranks them with rankStandings.
  if (source.kind === LEADERBOARD_SOURCE_KIND.faction) return null;
  const skill = member.professions.find((p) => p.id === source.professionId);
  if (!skill) return null;
  return { member, value: skill.skill, display: `${skill.skill} / ${skill.max_skill}`, detail: null };
}

/** Whether a board ranks members' standing with one faction. */
export function isFactionBoard(board: LeaderboardBoard): boolean {
  return board.source.kind === LEADERBOARD_SOURCE_KIND.faction;
}

/** Every member with a number on the board, best first; ties share a rank (1, 2, 2, 4) and read by name. */
export function rankBoard(members: readonly GuildMember[], board: LeaderboardBoard): LeaderboardEntry[] {
  const scored = boardCandidates(members, board)
    .map((m) => unranked(m, board))
    .filter((e) => e !== null);
  return rankEntries(scored, board.ascending);
}

/** Entries ordered by value (highest first unless ``ascending``), then name; ties share a rank (1, 2, 2, 4). */
export function rankEntries(
  entries: readonly Omit<LeaderboardEntry, "rank" | "tied">[],
  ascending: boolean,
): LeaderboardEntry[] {
  const sign = ascending ? 1 : -1;
  const scored = [...entries].sort(
    (a, b) => sign * (a.value - b.value) || memberFullName(a.member).localeCompare(memberFullName(b.member)),
  );
  let rank = 0;
  return scored.map((entry, i) => {
    if (i === 0 || scored[i - 1].value !== entry.value) rank = i + 1;
    const tied = scored[i - 1]?.value === entry.value || scored[i + 1]?.value === entry.value;
    return { ...entry, rank, tied };
  });
}

/** Whether the viewer (``?me=``) is a member of the guild but not on this board. */
export function viewerIsUnranked(members: readonly GuildMember[], ranked: readonly LeaderboardEntry[], me: string): boolean {
  return !ranked.some((e) => e.member.slug === me) && members.some((m) => m.slug === me);
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

/**
 * How many members a board can rank but has no number for. Profession boards:
 * not learned isn't missing data. Gains boards: a member with an older day but
 * no number for this stat on one of the two days (no older day at all is
 * ``noBaselineCount``; no gain is ``noGainCount``).
 */
export function missingCount(members: readonly GuildMember[], board: LeaderboardBoard, ranked: number): number {
  if (board.source.kind === LEADERBOARD_SOURCE_KIND.profession || isFactionBoard(board)) return 0;
  if (isGainBoard(board)) return members.filter((m) => m.baseline !== null && gainOf(m, board) === null).length;
  return boardCandidates(members, board).length - ranked;
}

/** On a gains board, how many members have no older stored day to count from; 0 elsewhere. */
export function noBaselineCount(members: readonly GuildMember[], board: LeaderboardBoard): number {
  if (!isGainBoard(board)) return 0;
  return members.filter((m) => m.baseline === null).length;
}

/** On a gains board, how many members we could compare but who gained nothing; 0 elsewhere. */
export function noGainCount(members: readonly GuildMember[], board: LeaderboardBoard): number {
  return members.filter((m) => gainOf(m, board)?.value === 0).length;
}

/** A gains board's note: what each member's gain is counted from. */
export function gainsNote(windowDays: number): string {
  return `Counted from each member's lookup at least ${formatCount(windowDays, "day", "days")} ago, or from their earliest lookup when we've known them for less.`;
}

/** On the level board, how many members are at the cap (once most are, the board is one big tie); 0 elsewhere. */
export function levelCapCount(members: readonly GuildMember[], board: LeaderboardBoard): number {
  const source = board.source;
  if (source.kind !== LEADERBOARD_SOURCE_KIND.stat || source.field !== GUILD_STAT_FIELDS.level) return 0;
  return members.filter((m) => m.level === MAX_LEVEL).length;
}
