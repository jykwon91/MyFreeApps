import type { LeatherBracket } from "@/games/wow-forever/types/gathering/leatherBracket";
import type { SkinBand } from "@/games/wow-forever/types/gathering/skinBand";

/** What the beasts in your band skin into: each bracket's main leather first, then the others they give. */
export function leatherForBand(brackets: readonly LeatherBracket[], band: Pick<SkinBand, "min" | "max">): string[] {
  const inBand = brackets.filter((b) => b.minLevel <= band.max && b.maxLevel >= band.min);
  const mains = inBand.map((b) => b.leathers[0]);
  const others = inBand.flatMap((b) => b.leathers.slice(1));
  return [...new Set([...mains, ...others])];
}
