import type { CraftRouteEntry } from "@/games/wow-forever/types/crafting";

/**
 * Tailoring 1–300. Recipes, skill colours and learn skills are the Forever
 * beta client's (`tailoring.json`); a test checks every row can be learned at
 * its start and is still not grey at its end. Rows from Artisan (200) on
 * can't be tested in the beta, so they are unconfirmed.
 */
export const TAILORING_ROUTE: readonly CraftRouteEntry[] = [
  { kind: "craft", spell: 2963, from: 1, to: 25, note: "Linen Cloth drops from humanoids around level 5–15.", confidence: "confirmed" },
  { kind: "craft", spell: 8776, from: 25, to: 50, confidence: "confirmed" },
  { kind: "craft", spell: 2397, from: 50, to: 60, confidence: "confirmed" },
  { kind: "craft", spell: 2964, from: 60, to: 70, note: "Wool Cloth drops from humanoids around level 15–25.", confidence: "confirmed" },
  { kind: "craft", spell: 2402, from: 70, to: 95, confidence: "confirmed" },
  { kind: "craft", spell: 3848, from: 95, to: 100, confidence: "confirmed" },
  {
    kind: "craft",
    spell: 3839,
    from: 100,
    to: 110,
    note: "Silk Cloth drops from humanoids around level 25–40. Keep making silk bolts after 110 — the next rows need well over 100.",
    confidence: "confirmed",
  },
  { kind: "craft", spell: 3848, from: 110, to: 120, confidence: "confirmed" },
  { kind: "craft", spell: 8760, from: 120, to: 135, confidence: "confirmed" },
  { kind: "craft", spell: 3871, from: 135, to: 150, confidence: "confirmed" },
  {
    kind: "craft",
    spell: 8791,
    from: 150,
    to: 170,
    note: "Mageweave drops from humanoids around level 35–50 — if you're lower, buy it at the auction house or wait.",
    confidence: "confirmed",
  },
  { kind: "craft", spell: 12048, from: 170, to: 185, confidence: "confirmed" },
  { kind: "craft", spell: 12053, from: 185, to: 195, confidence: "confirmed" },
  { kind: "craft", spell: 12072, from: 195, to: 210, confidence: "unconfirmed" },
  {
    kind: "craft",
    spell: 18402,
    from: 210,
    to: 225,
    note: "Runecloth drops from humanoids around level 48–60.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    spell: 18409,
    from: 225,
    to: 240,
    note: "Ironweb Spider Silk drops from spiders around level 50+.",
    confidence: "unconfirmed",
  },
  { kind: "craft", spell: 18423, from: 240, to: 265, confidence: "unconfirmed" },
  {
    kind: "options",
    from: 265,
    to: 300,
    title: "265–300: pick what you can get",
    intro:
      "No one recipe is a safe pick here yet — Artisan can't be tested in the beta, and Forever's new patterns have no known source. Use whichever of these you have.",
    options: [
      { spell: 23664, detail: "Pattern from the Argent Dawn quartermaster (needs reputation)." },
      { spell: 18560, detail: "Pattern from Qia in Everlook. Mooncloth sells well, but each one costs 2 Felcloth." },
      { spell: 18444, detail: "Pattern drops from many level 50+ mobs." },
      { spell: 18446, detail: "Pattern drops from Dark Casters in Eastern Plaguelands." },
      { spell: 1257486, detail: "New in Forever — where the pattern comes from isn't known yet." },
    ],
    confidence: "unconfirmed",
  },
];
