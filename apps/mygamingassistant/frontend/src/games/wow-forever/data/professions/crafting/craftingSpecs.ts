import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { CraftingSpecs } from "@/games/wow-forever/types/craftingSpecs";

const WINTERSPRING = 1452;
// Everlook's three weaponsmiths stand together (cmangos classic-db spawns).
const EVERLOOK_SMITHS = { label: "Everlook, Winterspring", zoneId: WINTERSPRING, x: 61.3, y: 37.1 };
const MASTER_NOTE =
  "In Classic, a Weaponsmith with skill 250 and level 50 picks one at Everlook in Winterspring — Kilram (axes), Lilith the Lithe (hammers) or Seril Scourgebane (swords). How Forever teaches the master specializations isn't known.";

const CHOOSE_ONCE =
  "Choose once. In Classic you can only have one: switching means paying to unlearn the one you have, losing its recipes, then doing the other quest.";

/**
 * Specializations: where the route forks and how each is learned. Spells and
 * names are the Forever client's; the quests, levels and skills are Classic
 * (cmangos), so the whole fork is unconfirmed in Forever. Which recipes need a
 * specialization is generated (`CraftRecipe.spec`), never listed here.
 */
export const CRAFTING_SPECS: Readonly<Partial<Record<CraftingProfession, CraftingSpecs>>> = {
  blacksmithing: {
    forkAt: 200,
    level: 40,
    intro: "At 200 you can specialize. Each unlocks its own recipes; the route itself never needs one.",
    choices: [
      { id: "armorsmith", spell: 9788, label: "Armorsmith", summary: "Plate armour recipes.", howTo: { kind: "quests" } },
      { id: "weaponsmith", spell: 9787, label: "Weaponsmith", summary: "Weapon recipes, and a master specialization later.", howTo: { kind: "quests" } },
      {
        id: "axesmith",
        spell: 17041,
        label: "Master Axesmith",
        summary: "Axes. Needs Weaponsmith.",
        requires: "weaponsmith",
        howTo: { kind: "note", text: MASTER_NOTE, spot: EVERLOOK_SMITHS },
      },
      {
        id: "hammersmith",
        spell: 17040,
        label: "Master Hammersmith",
        summary: "Maces and hammers. Needs Weaponsmith.",
        requires: "weaponsmith",
        howTo: { kind: "note", text: MASTER_NOTE, spot: EVERLOOK_SMITHS },
      },
      {
        id: "swordsmith",
        spell: 17039,
        label: "Master Swordsmith",
        summary: "Swords. Needs Weaponsmith.",
        requires: "weaponsmith",
        howTo: { kind: "note", text: MASTER_NOTE, spot: EVERLOOK_SMITHS },
      },
    ],
    unlearnWarning: CHOOSE_ONCE,
    confidence: "unconfirmed",
  },
  leatherworking: {
    forkAt: 225,
    level: 40,
    intro: "At 225 you can specialize. Each unlocks its own recipes; the route itself never needs one.",
    choices: [
      { id: "dragonscale", spell: 10656, label: "Dragonscale", summary: "Recipes made with dragon scales — Worn, Green, Blue and Black Dragonscale.", howTo: { kind: "quests" } },
      { id: "elemental", spell: 10658, label: "Elemental", summary: "Recipes made with elemental materials — Heart of Fire, Globe of Water, Living Essence.", howTo: { kind: "quests" } },
      { id: "tribal", spell: 10660, label: "Tribal", summary: "Recipes made with rare hides — Chimera, Frostsaber, Warbear and Devilsaur Leather.", howTo: { kind: "quests" } },
    ],
    unlearnWarning: CHOOSE_ONCE,
    confidence: "unconfirmed",
  },
};
