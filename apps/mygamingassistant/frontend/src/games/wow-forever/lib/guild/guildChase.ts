import { BOARD_UNITS, DEFAULT_BOARD_UNIT } from "@/games/wow-forever/data/guild/boardUnits";
import { HEROES_COPY, TITLE_CARD_COPY } from "@/games/wow-forever/data/guild/guildHallCopy";
import { formatCount } from "@/games/wow-forever/lib/character/formatCount";
import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";
import { memberFullName } from "@/games/wow-forever/lib/guild/guildMembers";
import type { LeaderboardEntry } from "@/games/wow-forever/types/guild/leaderboardEntry";
import type { TitleChallenger } from "@/games/wow-forever/types/guild/titleChallenger";

/** A number of what the board counts: "12 HKs", "1 level". */
export function unitCount(boardId: string, count: number): string {
  const unit = BOARD_UNITS[boardId] ?? DEFAULT_BOARD_UNIT;
  return formatCount(count, unit.one, unit.many);
}

/** "17 more HKs". */
export function moreUnits(boardId: string, count: number): string {
  const unit = BOARD_UNITS[boardId] ?? DEFAULT_BOARD_UNIT;
  return `${formatWhole(count)} more ${count === 1 ? unit.one : unit.many}`;
}

/** How far apart two entries' numbers are (never negative). */
export function entryGap(a: LeaderboardEntry, b: LeaderboardEntry): number {
  return Math.abs(a.value - b.value);
}

/** The first member ranked below the leaders, with how far behind; null when everyone shares the lead. */
export function titleChallenger(ranked: readonly LeaderboardEntry[]): TitleChallenger | null {
  const next = ranked.find((e) => e.rank > 1);
  if (!ranked[0] || !next) return null;
  return { member: next.member, gap: entryGap(ranked[0], next) };
}

/** "Closest challenger: Big Sue, 12 HKs behind". */
export function challengerLine(boardId: string, challenger: TitleChallenger): string {
  return TITLE_CARD_COPY.challenger(memberFullName(challenger.member), unitCount(boardId, challenger.gap));
}

/** What to say under a board's leader: how far the runner-up is, "Dead heat" at 0, or that the crown is open. */
export function heroHint(boardId: string, leader: LeaderboardEntry, runnerUp: LeaderboardEntry | null): string {
  if (!runnerUp) return HEROES_COPY.noRival;
  const gap = entryGap(leader, runnerUp);
  const rival = memberFullName(runnerUp.member);
  if (gap === 0) return HEROES_COPY.deadHeat(rival);
  return HEROES_COPY.chase(rival, unitCount(boardId, gap));
}
