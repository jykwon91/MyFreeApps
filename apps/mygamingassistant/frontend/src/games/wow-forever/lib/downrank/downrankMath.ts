import { GLOBAL_COOLDOWN_MS } from "@/games/wow-forever/data/downrank/downrankConfig";
import type { DownrankBest } from "@/games/wow-forever/types/downrank/downrankBest";
import type { DownrankRank } from "@/games/wow-forever/types/downrank/downrankRank";
import type { DownrankRow } from "@/games/wow-forever/types/downrank/downrankRow";
import type { DownrankSettings } from "@/games/wow-forever/types/downrank/downrankSettings";

const MS_PER_SECOND = 1000;

/** The game rounds a rolled amount half up. */
function roundHalfUp(value: number): number {
  return Math.floor(value + 0.5);
}

/** Levels past the learn level the amount grows for: it stops at the rank's max level. */
export function levelsGained(rank: DownrankRank, level: number): number {
  const top = rank.maxLevel ?? level;
  return Math.max(0, Math.min(level, top) - rank.level);
}

/**
 * Classic's downranking penalty: once you're past the rank's max level + 5, the rank gets
 * (max level + 5) / your level of its bonus. 1 = no penalty.
 */
export function downrankFactor(rank: DownrankRank, level: number): number {
  if (rank.fullBonusUntil === null || level <= rank.fullBonusUntil) return 1;
  return rank.fullBonusUntil / level;
}

/** Both penalties together; the below-level-20 one only when it's switched on. */
export function penaltyFactor(rank: DownrankRank, level: number, lowLevelPenalty: boolean): number {
  return (lowLevelPenalty ? rank.lowLevelFactor : 1) * downrankFactor(rank, level);
}

/** The rank's whole share of your bonus before penalties: direct + every tick. */
export function totalCoefficient(rank: DownrankRank): number {
  const direct = rank.direct?.coefficient ?? 0;
  const periodic = rank.periodic ? rank.periodic.coefficient * rank.periodic.ticks : 0;
  return direct + periodic;
}

/**
 * The time `perSecond` divides by: the cast (at least the global cooldown) for anything that lands at
 * once — its over-time part, like Regrowth's, rides along — or the duration for a spell that only ticks.
 */
export function spellSeconds(rank: DownrankRank): number {
  if (rank.periodic && !rank.direct) return (rank.periodic.ticks * rank.periodic.periodMs) / MS_PER_SECOND;
  return Math.max(rank.castMs, GLOBAL_COOLDOWN_MS) / MS_PER_SECOND;
}

/** One rank worked out for these settings. */
export function downrankRow(rank: DownrankRank, settings: DownrankSettings): DownrankRow {
  const gained = levelsGained(rank, settings.level);
  let baseAvg = 0;
  let spread = 0;
  if (rank.direct) {
    baseAvg += rank.direct.base + rank.direct.perLevel * gained;
    spread = (rank.direct.base * rank.direct.variance) / 2;
  }
  if (rank.periodic) baseAvg += (rank.periodic.tick + rank.periodic.perLevel * gained) * rank.periodic.ticks;
  const penalty = penaltyFactor(rank, settings.level, settings.lowLevelPenalty);
  const effectiveCoefficient = totalCoefficient(rank) * penalty;
  const bonusAdded = settings.bonus * effectiveCoefficient;
  const amount = (baseAvg + bonusAdded) * (1 + settings.talentPct / 100);
  const mana = rank.mana * (1 - settings.manaPct / 100);
  const seconds = spellSeconds(rank);
  return {
    rank,
    learnable: settings.level >= rank.level,
    baseMin: roundHalfUp(baseAvg - spread),
    baseMax: roundHalfUp(baseAvg + spread),
    baseAvg,
    penaltyFactor: penalty,
    effectiveCoefficient,
    bonusAdded,
    amount,
    mana,
    perMana: mana > 0 ? amount / mana : 0,
    seconds,
    perSecond: amount / seconds,
  };
}

export function downrankRows(ranks: readonly DownrankRank[], settings: DownrankSettings): DownrankRow[] {
  return ranks.map((rank) => downrankRow(rank, settings));
}

function bestBy(rows: readonly DownrankRow[], value: (row: DownrankRow) => number): number | null {
  let best: DownrankRow | null = null;
  for (const row of rows) {
    // A tie goes to the lower rank: same result, less mana.
    if (row.learnable && (!best || value(row) > value(best))) best = row;
  }
  return best ? best.rank.rank : null;
}

/** The learnable ranks with the most per mana and the most per second. */
export function bestRanks(rows: readonly DownrankRow[]): DownrankBest {
  return { perMana: bestBy(rows, (r) => r.perMana), perSecond: bestBy(rows, (r) => r.perSecond) };
}

/** The in-game line that casts this rank, e.g. `/cast Heal(Rank 2)`. */
export function macroLine(spellName: string, rank: number): string {
  return `/cast ${spellName}(Rank ${rank})`;
}
