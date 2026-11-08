import type { TamableBeast } from "@/games/wow-forever/types/hunterPets/tamableBeast";

/** "12", "12 to 14" or "" when the level isn't known. */
export function formatLevelRange(beast: Pick<TamableBeast, "minLevel" | "maxLevel">): string {
  if (beast.minLevel === null || beast.maxLevel === null) return "";
  return beast.minLevel === beast.maxLevel ? String(beast.minLevel) : `${beast.minLevel} to ${beast.maxLevel}`;
}

/** "2.0 s" or "" when the speed isn't known. */
export function formatAttackSpeed(seconds: number | null): string {
  return seconds === null ? "" : `${seconds.toFixed(1)} s`;
}

/** "+5%", "-10%" or "0%". */
export function formatSignedPercent(value: number): string {
  if (value > 0) return `+${value}%`;
  return value < 0 ? `${value}%` : "0%";
}
