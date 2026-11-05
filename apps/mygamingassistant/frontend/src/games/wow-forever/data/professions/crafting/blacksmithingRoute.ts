import type { CraftRouteEntry } from "@/games/wow-forever/types/crafting";

/**
 * Blacksmithing 1–300. Trainer recipes and bars up to 245 — recipes, skill
 * colours and reagents are the Forever client's (`blacksmithing.json`); the
 * skill each trainer teaches a recipe at is Classic (cmangos), so every row is
 * unconfirmed until it's been tried in Forever. Past 245 no trainer recipe
 * without a specialization reaches 300, so the last stretch lists Plans and
 * specialization recipes. The route never needs a specialization. A test
 * checks every row can be learned at its start and is still not grey at its end.
 */
export const BLACKSMITHING_ROUTE: readonly CraftRouteEntry[] = [
  { kind: "craft", spell: 2660, from: 1, to: 30, note: "Each stone takes 1 Rough Stone — mine it from Copper Veins.", confidence: "unconfirmed" },
  { kind: "craft", spell: 3320, from: 30, to: 60, confidence: "unconfirmed" },
  { kind: "craft", spell: 2661, from: 60, to: 90, confidence: "unconfirmed" },
  { kind: "craft", spell: 2666, from: 90, to: 110, confidence: "unconfirmed" },
  { kind: "craft", spell: 2668, from: 110, to: 135, confidence: "unconfirmed" },
  { kind: "craft", spell: 3331, from: 135, to: 150, confidence: "unconfirmed" },
  { kind: "craft", spell: 9985, from: 150, to: 165, confidence: "unconfirmed" },
  { kind: "craft", spell: 3501, from: 165, to: 180, note: "Green Dye is sold by trade goods vendors.", confidence: "unconfirmed" },
  { kind: "craft", spell: 7223, from: 180, to: 200, confidence: "unconfirmed" },
  { kind: "craft", spell: 9931, from: 200, to: 215, confidence: "unconfirmed" },
  { kind: "craft", spell: 9959, from: 215, to: 235, confidence: "unconfirmed" },
  { kind: "craft", spell: 9968, from: 235, to: 245, confidence: "unconfirmed" },
  {
    kind: "options",
    from: 245,
    to: 300,
    title: "Plans or a specialization recipe",
    intro:
      "No trainer recipe for every blacksmith goes from here to 300. Pick what you can get: Plans from a vendor or quest (Classic sources), or your specialization's own recipes. Craft each while it's orange or yellow.",
    options: [
      { spell: 10013, detail: "Plans: Ebon Shiv — Magnus Frostwake, Caer Darrow, Western Plaguelands (Classic). Orange until 255." },
      { spell: 16969, detail: "Plans: Ornate Thorium Handaxe — the same vendor. Thorium Bars only, yellow from 275 to 300." },
      { spell: 16971, detail: "Plans: Huge Thorium Battleaxe — the same vendor. Good for the last points, 280–300." },
      { spell: 16647, detail: "Plans: Imperial Plate Belt — a level 60 quest from Derotain Mudsipper in Gadgetzan (Classic)." },
      { spell: 9974, detail: "Armorsmith trainer recipe. Takes 24 Truesilver Bars — good to about 255." },
      { spell: 10011, detail: "Weaponsmith trainer recipe, orange until 250 and yellow to about 270." },
      { spell: 10015, detail: "Weaponsmith trainer recipe for 260 to about 280." },
      { spell: 16970, detail: "Master Axesmith Plans — Kilram's quest in Everlook (Classic). Yellow from 275 to 300." },
      { spell: 16973, detail: "Master Hammersmith Plans — Lilith the Lithe's quest in Everlook (Classic)." },
      { spell: 16978, detail: "Master Swordsmith Plans — Seril Scourgebane's quest in Everlook (Classic)." },
    ],
    confidence: "unconfirmed",
  },
];
