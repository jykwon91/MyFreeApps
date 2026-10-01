import type { CraftRouteEntry } from "@/games/wow-forever/types/crafting";

/**
 * Enchanting 1–300. Recipes, skill colours, learn skills and rods are the
 * Forever beta client's (`enchanting.json`); a test checks every row can be
 * learned at its start, is not grey at its end, and that each rod it needs
 * is made on an earlier row. Rows from 200 on can't be tested in the beta.
 */
export const ENCHANTING_ROUTE: readonly CraftRouteEntry[] = [
  {
    kind: "craft",
    spell: 7421,
    from: 1,
    to: 2,
    note:
      "Copper Rods are sold by the Enchanting Supplies vendor next to the trainer. Beta players report Motes of Magic are sold there too — we haven't confirmed it.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    spell: 1245320,
    from: 2,
    to: 10,
    note: "New in Forever: 1 Strange Dust makes 3 Motes of Magic. Strange Dust comes from disenchanting level 5–20 green items.",
    confidence: "confirmed",
  },
  { kind: "craft", spell: 7418, from: 10, to: 15, confidence: "confirmed" },
  { kind: "craft", spell: 7420, from: 15, to: 70, confidence: "confirmed" },
  { kind: "craft", spell: 7457, from: 70, to: 100, confidence: "confirmed" },
  {
    kind: "craft",
    spell: 7795,
    from: 100,
    to: 101,
    note: "Silver Rods are made by Blacksmiths — buy one at the auction house or ask a Blacksmith.",
    confidence: "confirmed",
  },
  { kind: "craft", spell: 14807, from: 101, to: 110, confidence: "confirmed" },
  {
    kind: "craft",
    spell: 13419,
    from: 110,
    to: 130,
    note: "Lesser Astral Essence comes from disenchanting level 16–20 green items.",
    confidence: "confirmed",
  },
  {
    kind: "craft",
    spell: 13501,
    from: 130,
    to: 155,
    note: "Soul Dust comes from disenchanting level 21–30 green items.",
    confidence: "confirmed",
  },
  { kind: "craft", spell: 13607, from: 155, to: 170, confidence: "confirmed" },
  { kind: "craft", spell: 13622, from: 170, to: 175, confidence: "confirmed" },
  {
    kind: "craft",
    spell: 13628,
    from: 175,
    to: 176,
    note: "Golden Rods are made by Blacksmiths — buy one at the auction house or ask a Blacksmith.",
    confidence: "confirmed",
  },
  { kind: "craft", spell: 13644, from: 176, to: 190, confidence: "confirmed" },
  {
    kind: "craft",
    spell: 13661,
    from: 190,
    to: 205,
    note: "Vision Dust comes from disenchanting level 31–40 green items.",
    confidence: "confirmed",
  },
  {
    kind: "craft",
    spell: 13702,
    from: 205,
    to: 206,
    note: "Truesilver Rods are made by Blacksmiths — buy one at the auction house or ask a Blacksmith.",
    confidence: "unconfirmed",
  },
  { kind: "craft", spell: 13746, from: 206, to: 225, confidence: "unconfirmed" },
  { kind: "craft", spell: 13858, from: 225, to: 240, confidence: "unconfirmed" },
  {
    kind: "craft",
    spell: 13939,
    from: 240,
    to: 265,
    note: "Dream Dust comes from disenchanting level 41–50 green items.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    spell: 20017,
    from: 265,
    to: 285,
    note: "The formula is limited stock — if it's sold out, come back later.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    spell: 20015,
    from: 285,
    to: 300,
    note: "Illusion Dust comes from disenchanting level 51–60 green items. The formula is limited stock.",
    confidence: "unconfirmed",
  },
];
