import { formatStatAmount, STAT_LABELS } from "@/games/wow-forever/data/statKeys";
import type { DeltaLine } from "@/games/wow-forever/types/itemCompare/deltaLine";
import type { ItemDelta } from "@/games/wow-forever/types/itemCompare/itemDelta";
import type { StatKey } from "@/games/wow-forever/data/statKeys";

const MINUS = "−";

/** "+12" / "−3" (a real minus sign), with the stat's % when it is one. */
function signed(key: StatKey, amount: number): string {
  const text = formatStatAmount(key, Math.abs(amount));
  return amount < 0 ? `${MINUS}${text.slice(1)}` : text;
}

function plain(amount: number): string {
  return `${amount < 0 ? MINUS : "+"}${Number(Math.abs(amount).toFixed(1))}`;
}

/** The delta as lines: armor, damage per second, then the stats; empty when nothing changes. */
export function deltaLines(delta: ItemDelta): DeltaLine[] {
  const lines: DeltaLine[] = [];
  if (delta.armor !== 0) lines.push({ key: "armor", text: `${plain(delta.armor)} Armor`, gain: delta.armor > 0 });
  if (delta.dps !== null && delta.dps !== 0) {
    lines.push({ key: "dps", text: `${plain(delta.dps)} damage per second`, gain: delta.dps > 0 });
  }
  for (const { key, amount } of delta.stats) {
    lines.push({ key, text: `${signed(key, amount)} ${STAT_LABELS[key]}`, gain: amount > 0 });
  }
  return lines;
}
