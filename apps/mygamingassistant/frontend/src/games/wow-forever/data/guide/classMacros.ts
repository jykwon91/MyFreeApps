import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { ClassMacro } from "@/games/wow-forever/types/classMacro";
import type { MoreMacrosLink } from "@/games/wow-forever/types/moreMacrosLink";

/** Classes with a page of their own for more macros. */
export const MORE_CLASS_MACROS: Readonly<Partial<Record<WowClassId, MoreMacrosLink>>> = {
  warlock: { to: "/wow-forever/warlock-macros", label: "More Warlock macros" },
};

/**
 * Ready-made mouseover macros, one template + one spell each. Only spells a
 * Classic trainer teaches (no talents, which Forever is reworking); a test
 * checks each against that class's spells in the Forever client
 * (`classSpellNames.json`). Rogues and Warriors are left
 * out: they fight in melee on their own target, so mouseover rarely helps.
 * Forever renamed the Warlock's Curse of Agony to Bane of Agony.
 */
export const CLASS_MACROS: readonly ClassMacro[] = [
  { id: "druid-rejuvenation", classId: "druid", template: "friendly", spell: "Rejuvenation", summary: "A heal over time on the friend under your mouse." },
  { id: "druid-regrowth", classId: "druid", template: "friendly", spell: "Regrowth", summary: "A quick heal plus a heal over time on the friend under your mouse." },
  { id: "druid-healing-touch", classId: "druid", template: "friendly", spell: "Healing Touch", summary: "Your big, slow heal on the friend under your mouse." },
  { id: "druid-remove-curse", classId: "druid", template: "friendly", spell: "Remove Curse", summary: "Takes a curse off the friend under your mouse." },
  { id: "druid-abolish-poison", classId: "druid", template: "friendly", spell: "Abolish Poison", summary: "Clears poisons from the friend under your mouse over a few seconds." },
  { id: "druid-innervate", classId: "druid", template: "friendly", spell: "Innervate", summary: "Gives a healer under your mouse a burst of mana back." },
  { id: "druid-moonfire", classId: "druid", template: "enemy", spell: "Moonfire", summary: "Puts Moonfire's damage over time on the enemy under your mouse." },
  { id: "druid-faerie-fire", classId: "druid", template: "enemy", spell: "Faerie Fire", summary: "Lowers the armor of the enemy under your mouse, without changing your target." },
  { id: "druid-entangling-roots", classId: "druid", template: "enemy", spell: "Entangling Roots", summary: "Roots the enemy under your mouse in place." },

  { id: "hunter-hunters-mark", classId: "hunter", template: "enemy", spell: "Hunter's Mark", summary: "Marks the enemy under your mouse so everyone can see it and hit it harder." },
  { id: "hunter-serpent-sting", classId: "hunter", template: "enemy", spell: "Serpent Sting", summary: "Poisons the enemy under your mouse for damage over time." },

  { id: "mage-remove-lesser-curse", classId: "mage", template: "friendly", spell: "Remove Lesser Curse", summary: "Takes a curse off the friend under your mouse." },
  { id: "mage-arcane-intellect", classId: "mage", template: "friendly", spell: "Arcane Intellect", summary: "Buffs the friend under your mouse without clicking them first." },
  { id: "mage-counterspell", classId: "mage", template: "enemy", spell: "Counterspell", summary: "Interrupts the enemy under your mouse while you keep your target." },
  { id: "mage-polymorph", classId: "mage", template: "enemy", spell: "Polymorph", summary: "Turns the enemy under your mouse into a sheep, so you can keep fighting your target." },

  { id: "paladin-flash-of-light", classId: "paladin", template: "friendly", spell: "Flash of Light", summary: "A fast, cheap heal on the friend under your mouse." },
  { id: "paladin-holy-light", classId: "paladin", template: "friendly", spell: "Holy Light", summary: "Your big, slow heal on the friend under your mouse." },
  { id: "paladin-cleanse", classId: "paladin", template: "friendly", spell: "Cleanse", summary: "Removes a poison, disease or magic effect from the friend under your mouse." },
  { id: "paladin-purify", classId: "paladin", template: "friendly", spell: "Purify", summary: "Removes a poison or disease from the friend under your mouse. Use it until you learn Cleanse." },
  { id: "paladin-blessing-of-freedom", classId: "paladin", template: "friendly", spell: "Blessing of Freedom", summary: "Frees the friend under your mouse from slows and roots." },
  { id: "paladin-blessing-of-protection", classId: "paladin", template: "friendly", spell: "Blessing of Protection", summary: "Shields the friend under your mouse from physical attacks for a short time." },
  { id: "paladin-hammer-of-justice", classId: "paladin", template: "enemy", spell: "Hammer of Justice", summary: "Stuns the enemy under your mouse, which also stops its cast." },

  { id: "priest-flash-heal", classId: "priest", template: "friendly", spell: "Flash Heal", summary: "A fast heal on the friend under your mouse." },
  { id: "priest-renew", classId: "priest", template: "friendly", spell: "Renew", summary: "A heal over time on the friend under your mouse." },
  { id: "priest-power-word-shield", classId: "priest", template: "friendly", spell: "Power Word: Shield", summary: "Shields the friend under your mouse from damage." },
  { id: "priest-dispel-magic", classId: "priest", template: "friendly", spell: "Dispel Magic", summary: "Removes a magic effect from the friend under your mouse." },
  { id: "priest-cure-disease", classId: "priest", template: "friendly", spell: "Cure Disease", summary: "Removes a disease from the friend under your mouse." },
  { id: "priest-shadow-word-pain", classId: "priest", template: "enemy", spell: "Shadow Word: Pain", summary: "Puts damage over time on the enemy under your mouse." },
  { id: "priest-shackle-undead", classId: "priest", template: "enemy", spell: "Shackle Undead", summary: "Holds the undead enemy under your mouse in place." },

  { id: "shaman-healing-wave", classId: "shaman", template: "friendly", spell: "Healing Wave", summary: "Your big heal on the friend under your mouse." },
  { id: "shaman-lesser-healing-wave", classId: "shaman", template: "friendly", spell: "Lesser Healing Wave", summary: "A faster, smaller heal on the friend under your mouse." },
  { id: "shaman-chain-heal", classId: "shaman", template: "friendly", spell: "Chain Heal", summary: "Heals the friend under your mouse, then jumps to hurt friends near them." },
  { id: "shaman-cure-poison", classId: "shaman", template: "friendly", spell: "Cure Poison", summary: "Removes a poison from the friend under your mouse." },
  { id: "shaman-cure-disease", classId: "shaman", template: "friendly", spell: "Cure Disease", summary: "Removes a disease from the friend under your mouse." },
  { id: "shaman-earth-shock", classId: "shaman", template: "enemy", spell: "Earth Shock", summary: "Interrupts the enemy under your mouse while you keep your target." },
  { id: "shaman-flame-shock", classId: "shaman", template: "enemy", spell: "Flame Shock", summary: "Puts fire damage over time on the enemy under your mouse." },
  { id: "shaman-purge", classId: "shaman", template: "enemy", spell: "Purge", summary: "Strips a magic buff off the enemy under your mouse." },

  { id: "warlock-corruption", classId: "warlock", template: "enemy", spell: "Corruption", summary: "Spreads Corruption to the enemy under your mouse without retargeting." },
  { id: "warlock-bane-of-agony", classId: "warlock", template: "enemy", spell: "Bane of Agony", summary: "Spreads Bane of Agony (Forever's name for Curse of Agony) to the enemy under your mouse." },
  { id: "warlock-fear", classId: "warlock", template: "enemy", spell: "Fear", summary: "Fears the enemy under your mouse so you can keep damaging your target." },
];
