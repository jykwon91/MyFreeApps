import type { CraftRouteEntry } from "@/games/wow-forever/types/crafting";

/**
 * Engineering 1–300. Trainer recipes up to 265 — recipes, skill colours,
 * reagents and tools are the Forever client's (`engineering.json`); the skill
 * each trainer teaches a recipe at is Classic (cmangos), so every row is
 * unconfirmed until it's been tried in Forever. Past 265 no trainer recipe
 * without a specialization is worth making, so the last stretch lists
 * Schematics and specialization recipes. The route never needs a specialization. A test checks every row
 * can be learned at its start and is still not grey at its end.
 */
export const ENGINEERING_ROUTE: readonly CraftRouteEntry[] = [
  { kind: "craft", spell: 3918, from: 1, to: 30, note: "Each takes 1 Rough Stone — open it on the shopping list to see where it's mined.", confidence: "unconfirmed" },
  { kind: "craft", spell: 3922, from: 30, to: 50, confidence: "unconfirmed" },
  {
    kind: "craft",
    spell: 7430,
    from: 50,
    to: 51,
    note: "One craft for one point. Keep the spanner: in the Forever client scopes, goggles and the Green Lens ask for an Arclight Spanner in your bags.",
    confidence: "unconfirmed",
  },
  { kind: "craft", spell: 3924, from: 51, to: 75, confidence: "unconfirmed" },
  { kind: "craft", spell: 3929, from: 75, to: 90, confidence: "unconfirmed" },
  { kind: "craft", spell: 3926, from: 90, to: 105, note: "Uses the Handful of Copper Bolts recipe from 30 — make 2 per modulator.", confidence: "unconfirmed" },
  { kind: "craft", spell: 3938, from: 105, to: 125, confidence: "unconfirmed" },
  { kind: "craft", spell: 3945, from: 125, to: 135, confidence: "unconfirmed" },
  { kind: "craft", spell: 3942, from: 135, to: 150, confidence: "unconfirmed" },
  { kind: "craft", spell: 3953, from: 150, to: 160, confidence: "unconfirmed" },
  { kind: "craft", spell: 3958, from: 160, to: 175, confidence: "unconfirmed" },
  { kind: "craft", spell: 12585, from: 175, to: 190, confidence: "unconfirmed" },
  { kind: "craft", spell: 3962, from: 190, to: 200, note: "Each grenade takes 1 Heavy Blasting Powder — the recipe from 125.", confidence: "unconfirmed" },
  { kind: "craft", spell: 12589, from: 200, to: 215, confidence: "unconfirmed" },
  { kind: "craft", spell: 12599, from: 215, to: 235, note: "Keep the casings: the next row takes 2 per bomb.", confidence: "unconfirmed" },
  {
    kind: "craft",
    spell: 12619,
    from: 235,
    to: 250,
    note: "Each bomb takes 2 Mithril Casing, 1 Unstable Trigger and 2 Solid Blasting Powder — all made by Engineering; the shopping list counts what they take.",
    confidence: "unconfirmed",
  },
  { kind: "craft", spell: 12621, from: 250, to: 265, confidence: "unconfirmed" },
  {
    kind: "options",
    from: 265,
    to: 300,
    title: "Schematics, the Green Lens or a specialization recipe",
    intro:
      "No easy trainer recipe for every engineer goes from here to 300. Buy a Schematic from an engineering supplies vendor (Classic sources), make the Green Lens, or your specialization's own recipes. Craft each while it's orange or yellow.",
    options: [
      {
        spell: 19791,
        detail: "Schematic: Thorium Widget — Gearcutter Cogspinner, Ironforge (Alliance) or Sovik, Orgrimmar (Horde) (Classic). Learn at 260; orange until 280.",
      },
      { spell: 19790, detail: "Schematic: Thorium Grenade — the same vendors (Classic). Each takes a Thorium Widget, so it uses the widgets you make." },
      { spell: 12622, detail: "Trainer recipe for every engineer. Takes Jade, Aquamarine and Heart of the Wild, and the Arclight Spanner. Good to about 275." },
      { spell: 19795, detail: "Schematic: Thorium Tube — Xizzer Fizzbolt, Everlook, Winterspring (Classic). Learn at 275; orange until 295, so it carries you to 300." },
      { spell: 23080, detail: "Schematic: Powerful Seaforium Charge — Xizzer Fizzbolt, Everlook, Winterspring (Classic). Learn at 275; takes 2 Thorium Widgets." },
      { spell: 12759, detail: "Gnomish trainer recipe. Takes Essence and Ichor of Undeath — good to about 270." },
      {
        spell: 23078,
        detail: "Goblin: Schematic: Goblin Jumper Cables XL. No Classic vendor or drop is in the data, so where to get it isn't known. Learn at 265; orange until 285.",
      },
    ],
    confidence: "unconfirmed",
  },
];
