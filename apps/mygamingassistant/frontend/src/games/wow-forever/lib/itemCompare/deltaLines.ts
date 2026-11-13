import { ITEM_COMPARE_COPY as COPY } from "@/games/wow-forever/data/itemCompare/itemCompareCopy";
import { formatStatMagnitude, STAT_LABELS, type StatKey } from "@/games/wow-forever/data/statKeys";
import type { DeltaLine } from "@/games/wow-forever/types/itemCompare/deltaLine";
import type { ItemDelta } from "@/games/wow-forever/types/itemCompare/itemDelta";

const MINUS = "−";

function sign(amount: number): string {
  if (amount > 0) return "+";
  return amount < 0 ? MINUS : "";
}

/** "+12" / "−3" (a real minus sign) / "0", with the stat's % when it is one; formatted from the absolute value. */
export function formatSignedStat(key: StatKey, amount: number): string {
  return `${sign(amount)}${formatStatMagnitude(key, Math.abs(amount))}`;
}

/** The same for a plain number (armor, damage per second), to one decimal at most. */
export function formatSignedNumber(amount: number): string {
  return `${sign(amount)}${Number(Math.abs(amount).toFixed(1))}`;
}

/** The delta as lines: armor, damage per second, then the stats; empty when nothing changes. */
export function deltaLines(delta: ItemDelta): DeltaLine[] {
  const lines: DeltaLine[] = [];
  if (delta.armor !== 0) lines.push({ key: "armor", text: `${formatSignedNumber(delta.armor)} Armor`, gain: delta.armor > 0 });
  if (delta.dps !== null && delta.dps !== 0) {
    lines.push({ key: "dps", text: `${formatSignedNumber(delta.dps)} damage per second`, gain: delta.dps > 0 });
  }
  for (const { key, amount } of delta.stats) {
    lines.push({ key, text: `${formatSignedStat(key, amount)} ${STAT_LABELS[key]}`, gain: amount > 0 });
  }
  return lines;
}

/** What the lines leave out: damage and effects the comparison couldn't cover. */
export function deltaNotes(delta: ItemDelta): string[] {
  const notes: string[] = [];
  if (delta.damageNotCompared) notes.push(COPY.damageNotCompared);
  if (delta.otherEffects) notes.push(COPY.otherEffectsNotCompared);
  return notes;
}
