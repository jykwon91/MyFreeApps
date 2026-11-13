/**
 * Which talent tab (1-3, the game's order) each spec is, keyed `class/spec`, so
 * MGA Loot can guess your spec from where your talent points are. Classic-verified
 * tab order; the Feral tab is both Feral specs (the addon picks damage unless you
 * set tank with `/mgaloot spec feral-tank`).
 */
export const LOOT_ADDON_TALENT_TABS: Readonly<Record<string, number>> = {
  "druid/balance": 1,
  "druid/feral-damage": 2,
  "druid/feral-tank": 2,
  "druid/restoration": 3,
  "hunter/beast-mastery": 1,
  "hunter/marksmanship": 2,
  "hunter/survival": 3,
  "mage/arcane": 1,
  "mage/fire": 2,
  "mage/frost": 3,
  "paladin/holy": 1,
  "paladin/protection": 2,
  "paladin/retribution": 3,
  "priest/discipline": 1,
  "priest/holy": 2,
  "priest/shadow": 3,
  "rogue/assassination": 1,
  "rogue/combat": 2,
  "rogue/subtlety": 3,
  "shaman/elemental": 1,
  "shaman/enhancement": 2,
  "shaman/restoration": 3,
  "warlock/affliction": 1,
  "warlock/demonology": 2,
  "warlock/destruction": 3,
  "warrior/arms": 1,
  "warrior/fury": 2,
  "warrior/protection": 3,
};
