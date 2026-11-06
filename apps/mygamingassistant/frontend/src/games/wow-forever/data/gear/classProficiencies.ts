import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ClassProficiency } from "@/games/wow-forever/types/classProficiency";

const LIGHT = ["Cloth"];
const LEATHER = ["Cloth", "Leather"];
const MAIL = ["Cloth", "Leather", "Mail"];
const HEAVY_ARMOR_LEVEL = 40;
const DUAL_WIELD_LEVEL = 20;

/**
 * What each class can train to equip — **Classic-verified** (checked with the
 * wow-forever-expert agent, 2026-11-06). Forever hasn't published changes;
 * its client says weapon skills still exist. Type names are the client's
 * ItemSubClass names (`items.json` `itemType`); 1H vs 2H comes from the slot.
 */
export const CLASS_PROFICIENCIES: Record<WowClassId, ClassProficiency> = {
  warrior: {
    armor: MAIL,
    heavyArmor: { type: "Plate", level: HEAVY_ARMOR_LEVEL },
    oneHand: ["Dagger", "Sword", "Axe", "Mace", "Fist Weapon"],
    twoHand: ["Sword", "Axe", "Mace", "Staff", "Polearm"],
    ranged: ["Bow", "Gun", "Crossbow", "Thrown"],
    shield: true,
    dualWieldLevel: DUAL_WIELD_LEVEL,
  },
  paladin: {
    armor: MAIL,
    heavyArmor: { type: "Plate", level: HEAVY_ARMOR_LEVEL },
    oneHand: ["Sword", "Axe", "Mace"],
    twoHand: ["Sword", "Axe", "Mace", "Polearm"],
    ranged: [],
    shield: true,
    dualWieldLevel: null,
  },
  hunter: {
    armor: LEATHER,
    heavyArmor: { type: "Mail", level: HEAVY_ARMOR_LEVEL },
    oneHand: ["Dagger", "Sword", "Axe", "Fist Weapon"],
    twoHand: ["Sword", "Axe", "Staff", "Polearm"],
    ranged: ["Bow", "Gun", "Crossbow", "Thrown"],
    shield: false,
    dualWieldLevel: DUAL_WIELD_LEVEL,
  },
  rogue: {
    armor: LEATHER,
    heavyArmor: null,
    oneHand: ["Dagger", "Sword", "Mace", "Fist Weapon"],
    twoHand: [],
    ranged: ["Bow", "Gun", "Crossbow", "Thrown"],
    shield: false,
    dualWieldLevel: 1,
  },
  shaman: {
    armor: LEATHER,
    heavyArmor: { type: "Mail", level: HEAVY_ARMOR_LEVEL },
    oneHand: ["Dagger", "Axe", "Mace", "Fist Weapon"],
    twoHand: ["Axe", "Mace", "Staff"],
    ranged: [],
    shield: true,
    dualWieldLevel: null,
  },
  druid: {
    armor: LEATHER,
    heavyArmor: null,
    oneHand: ["Dagger", "Mace", "Fist Weapon"],
    twoHand: ["Mace", "Staff"],
    ranged: [],
    shield: false,
    dualWieldLevel: null,
  },
  mage: {
    armor: LIGHT,
    heavyArmor: null,
    oneHand: ["Dagger", "Sword"],
    twoHand: ["Staff"],
    ranged: ["Wand"],
    shield: false,
    dualWieldLevel: null,
  },
  warlock: {
    armor: LIGHT,
    heavyArmor: null,
    oneHand: ["Dagger", "Sword"],
    twoHand: ["Staff"],
    ranged: ["Wand"],
    shield: false,
    dualWieldLevel: null,
  },
  priest: {
    armor: LIGHT,
    heavyArmor: null,
    oneHand: ["Dagger", "Mace"],
    twoHand: ["Staff"],
    ranged: ["Wand"],
    shield: false,
    dualWieldLevel: null,
  },
};
