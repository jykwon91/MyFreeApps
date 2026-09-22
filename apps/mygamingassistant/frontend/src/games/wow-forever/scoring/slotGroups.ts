import { SLOT_LABELS, type ItemSlot } from "@/games/wow-forever/data/itemSlots";

/**
 * Slots that can be compared head to head. A One-Hand weapon fits either hand,
 * so it is comparable with Main Hand and Off Hand items.
 */
type SlotGroup = ItemSlot | "hand" | "off_hand_item" | "ranged_slot";

const SLOT_GROUP: Partial<Record<ItemSlot, SlotGroup>> = {
  main_hand: "hand",
  off_hand: "off_hand_item",
  held_in_off_hand: "off_hand_item",
  ranged: "ranged_slot",
  thrown: "ranged_slot",
  relic: "ranged_slot",
};

function groupOf(slot: ItemSlot): SlotGroup {
  return SLOT_GROUP[slot] ?? slot;
}

function comparable(a: ItemSlot, b: ItemSlot): boolean {
  if (a === "one_hand" || b === "one_hand") {
    const other = a === "one_hand" ? b : a;
    return other === "one_hand" || other === "main_hand" || other === "off_hand";
  }
  return groupOf(a) === groupOf(b);
}

/**
 * Warning text when the items can't sensibly be compared, or null.
 * Items with an unknown slot are ignored.
 */
export function slotMismatchWarning(slots: readonly (ItemSlot | null)[]): string | null {
  const known = slots.filter((s): s is ItemSlot => s !== null);
  if (known.length < 2) return null;
  const allComparable = known.every((s) => comparable(known[0], s));
  if (allComparable) return null;

  const hasTwoHand = known.includes("two_hand");
  const labels = [...new Set(known.map((s) => SLOT_LABELS[s]))].join(", ");
  if (hasTwoHand) {
    return `A two-hander replaces both hands, so compare it against your main hand and off hand together (${labels}).`;
  }
  return `These items go in different slots (${labels}) — the scores are shown, but the comparison may not be meaningful.`;
}
