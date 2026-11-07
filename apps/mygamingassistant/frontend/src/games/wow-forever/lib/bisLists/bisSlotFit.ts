import { BIS_SLOTS, type BisSlot, type BisSlotId } from "@/games/wow-forever/data/bisLists/bisSlots";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import { PRE_RAID_LEVEL } from "@/games/wow-forever/data/gear/gearPageConfig";
import { GEAR_SLOT_GROUPS } from "@/games/wow-forever/data/gear/gearSlotGroups";
import { canEquip, groupUsable } from "@/games/wow-forever/gear/gearFilters";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { GearSlotGroup } from "@/games/wow-forever/types/gearSlotGroup";

const GROUPS: ReadonlyMap<string, GearSlotGroup> = new Map(GEAR_SLOT_GROUPS.map((g) => [g.id, g]));
const SLOTS: ReadonlyMap<BisSlotId, BisSlot> = new Map(BIS_SLOTS.map((s) => [s.id, s]));

/** The Best gear card a row fills from. Every BiS slot names a real card (tested). */
export function bisSlotGroup(slot: BisSlotId): GearSlotGroup {
  const groupId = SLOTS.get(slot)?.groupId;
  const group = groupId ? GROUPS.get(groupId) : undefined;
  if (!group) throw new Error(`BiS slot ${slot} has no gear slot group`);
  return group;
}

/** The rows a class's list has: no two-hander row for a Rogue, no ranged row for a Paladin (as on Best gear). */
export function bisSlotsFor(classId: WowClassId): readonly BisSlot[] {
  return BIS_SLOTS.filter((s) => groupUsable(bisSlotGroup(s.id), classId));
}

/** Can a level-60 player of this class wear the item in this row? (Classic proficiencies, as Best gear.) */
export function fitsBisSlot(item: ClientItem, slot: BisSlotId, classId: WowClassId): boolean {
  const group = bisSlotGroup(slot);
  return groupUsable(group, classId) && canEquip(item, group, classId, PRE_RAID_LEVEL);
}
