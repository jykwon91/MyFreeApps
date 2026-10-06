/**
 * Forever's level cap: 30 while the beta runs, 60 from launch (2026-11-04).
 *
 * Every level field, and anything picked "for your level", stops at
 * `levelCap()` — food you can't eat yet, or a level you can't reach, is no
 * use to the player. The cap rises on launch day by itself; no deploy needed.
 */
export const MAX_LEVEL = 60;
export const BETA_LEVEL_CAP = 30;
/** Launch day, midnight UTC. */
const LAUNCH = Date.UTC(2026, 10, 4);

export function levelCap(now: number = Date.now()): number {
  return now >= LAUNCH ? MAX_LEVEL : BETA_LEVEL_CAP;
}

/** A level the player can be: a whole number from 1 to the cap, or null. */
export function playerLevel(value: number | null, now: number = Date.now()): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const level = Math.round(value);
  if (level < 1) return null;
  return Math.min(level, levelCap(now));
}
