import { RAIDS_OPEN_LABEL } from "@/games/wow-forever/data/gear/gearPageConfig";
import { findClass } from "@/games/wow-forever/data/classes";
import type { WeaponStats } from "@/games/wow-forever/types/compareItem";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { InstanceDrop } from "@/games/wow-forever/types/itemPages/instanceDrop";
import type { InstanceInfo } from "@/games/wow-forever/types/itemPages/instanceInfo";
import { INSTANCE_MOB_KIND } from "@/games/wow-forever/types/itemPages/instanceMobKind";
import { ITEM_BIND, type ItemBind } from "@/games/wow-forever/types/itemPages/itemBind";
import type { ItemQuest } from "@/games/wow-forever/types/itemPages/itemQuest";

const BIND_TEXT: Readonly<Record<ItemBind, string>> = {
  [ITEM_BIND.pickup]: "Binds when picked up",
  [ITEM_BIND.equip]: "Binds when equipped",
  [ITEM_BIND.use]: "Binds when used",
  [ITEM_BIND.quest]: "Quest Item",
};

/** The game's bind line: "Binds when picked up". */
export function bindText(bind: ItemBind): string {
  return BIND_TEXT[bind];
}

/** "(30.6 damage per second)" — the tooltip's DPS, one decimal. */
export function weaponDps(weapon: WeaponStats): string {
  const dps = (weapon.minDamage + weapon.maxDamage) / 2 / weapon.speed;
  return `(${dps.toFixed(1)} damage per second)`;
}

/** "Classes: Warlock, Mage". */
export function classesText(classes: readonly WowClassId[]): string {
  return `Classes: ${classes.map((c) => findClass(c)?.name ?? c).join(", ")}`;
}

/** "level 59 dungeon · enter from level 52" / "raid". */
export function instanceLevelText(info: InstanceInfo): string {
  const parts = [info.maxLevel > 0 ? `level ${info.maxLevel} ${info.kind}` : info.kind];
  if (info.requiredLevel > 0) parts.push(`enter from level ${info.requiredLevel}`);
  return parts.join(" · ");
}

const KIND_TEXT = { [INSTANCE_MOB_KIND.boss]: "boss", [INSTANCE_MOB_KIND.rare]: "rare spawn, not always up", [INSTANCE_MOB_KIND.trash]: "" } as const;

/** "Emperor Dagran Thaurissan · boss, level 59 · 19.8%". */
export function instanceDropText(drop: InstanceDrop): string {
  const level = drop.minLevel === drop.maxLevel ? `level ${drop.minLevel}` : `level ${drop.minLevel}–${drop.maxLevel}`;
  const kind = KIND_TEXT[drop.kind];
  return `${drop.name} · ${kind ? `${kind}, ` : ""}${level} · ${drop.chance}%`;
}

/** Shown on every raid drop. */
export const RAID_NOTE = `Raids open in WoW Forever on ${RAIDS_OPEN_LABEL}.`;

/** "level 21 quest · pick up from level 16 · Warrior only". */
export function questLevelText(quest: ItemQuest): string {
  const parts = [`level ${quest.level} quest`];
  if (quest.minLevel > 0 && quest.minLevel !== quest.level) parts.push(`pick up from level ${quest.minLevel}`);
  if (quest.classes) parts.push(`${findClass(quest.classes)?.name ?? quest.classes} only`);
  return parts.join(" · ");
}
