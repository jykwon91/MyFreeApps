import type { GearSource } from "@/games/wow-forever/types/gearSource";

/** The source chips, in the order the legend lists them. */
export const SOURCE_CHIP = {
  crafted: "Crafted (game files)",
  quest: "Quest (Classic data, may differ)",
  drop: "Boss drop (Classic data, may differ)",
  unknown: "Source unknown",
} as const;

export type SourceChipKind = keyof typeof SOURCE_CHIP;

/** The chip an item gets: its first source's kind (crafted are listed first), else unknown. */
export function sourceChipKind(sources: readonly GearSource[]): SourceChipKind {
  return sources[0]?.kind ?? "unknown";
}

/** "Tailoring 270" / "Quest: Saving the Best for Last (from level 58)" / "Edwin VanCleef, The Deadmines (levels 10–24)". */
export function describeSource(source: GearSource): string {
  if (source.kind === "crafted") return `${source.profession} ${source.skill}`;
  if (source.kind === "quest") return `Quest: ${source.title} (from level ${source.minLevel})`;
  if (!source.dungeon) return source.boss;
  const { name, level, enterAt } = source.dungeon;
  return `${source.boss}, ${name} (levels ${enterAt}–${level})`;
}

/**
 * "Top pick" for the card's first item, else "92% of top pick".
 *
 * When the close rule ranked a known-source item above a higher-scoring
 * no-source one (closeRuleApplied = true on the top pick, pctOfBest > 100
 * on the second):
 *   - top pick → "Top pick · known source"
 *   - second item → "Scores X% of top pick — source unknown"
 *
 * This tells users why the lower-scoring item appears first without hiding
 * the fact that the other item scored more.
 */
export function pctLabel(pctOfBest: number, isTop: boolean, closeRuleApplied = false): string {
  if (isTop) return closeRuleApplied ? "Top pick · known source" : "Top pick";
  if (pctOfBest > 100) return `Scores ${Math.round(pctOfBest)}% of top pick — source unknown`;
  return `${Math.round(pctOfBest)}% of top pick`;
}
