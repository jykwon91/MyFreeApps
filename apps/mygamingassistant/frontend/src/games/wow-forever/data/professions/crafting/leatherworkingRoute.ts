import type { CraftRouteEntry } from "@/games/wow-forever/types/crafting";

/**
 * Leatherworking 1–300. Trainer recipes up to 245 — recipes, skill colours and
 * reagents are the Forever client's (`leatherworking.json`); the skill each
 * trainer teaches a recipe at is Classic (cmangos), so every row is
 * unconfirmed until it's been tried in Forever. Past 245 no trainer recipe
 * without a specialization reaches 300, so the last stretch lists Patterns and
 * specialization recipes. The route never needs a specialization. A test
 * checks every row can be learned at its start and is still not grey at its end.
 */
export const LEATHERWORKING_ROUTE: readonly CraftRouteEntry[] = [
  { kind: "craft", spell: 2152, from: 1, to: 30, note: "Each kit takes 1 Light Leather — skin the beasts around your starting zone.", confidence: "unconfirmed" },
  { kind: "craft", spell: 9058, from: 30, to: 45, confidence: "unconfirmed" },
  { kind: "craft", spell: 3753, from: 45, to: 55, confidence: "unconfirmed" },
  { kind: "craft", spell: 3756, from: 55, to: 85, confidence: "unconfirmed" },
  { kind: "craft", spell: 3763, from: 85, to: 100, confidence: "unconfirmed" },
  { kind: "craft", spell: 2168, from: 100, to: 120, note: "Gray Dye is sold by leatherworking supply vendors.", confidence: "unconfirmed" },
  {
    kind: "craft",
    spell: 3768,
    from: 120,
    to: 140,
    note: "Cure each Medium Hide first (Cured Medium Hide, from the trainer: 1 hide + 1 Salt). Salt is sold by leatherworking supply vendors.",
    confidence: "unconfirmed",
  },
  { kind: "craft", spell: 3780, from: 140, to: 155, confidence: "unconfirmed" },
  { kind: "craft", spell: 7151, from: 155, to: 180, note: "Cure each Heavy Hide first (Cured Heavy Hide: 1 hide + 3 Salt).", confidence: "unconfirmed" },
  { kind: "craft", spell: 7156, from: 180, to: 190, confidence: "unconfirmed" },
  { kind: "craft", spell: 10487, from: 190, to: 205, confidence: "unconfirmed" },
  { kind: "craft", spell: 10507, from: 205, to: 215, confidence: "unconfirmed" },
  { kind: "craft", spell: 10548, from: 215, to: 230, confidence: "unconfirmed" },
  { kind: "craft", spell: 10558, from: 230, to: 245, confidence: "unconfirmed" },
  {
    kind: "options",
    from: 245,
    to: 300,
    title: "Patterns or a specialization recipe",
    intro:
      "No trainer recipe for every leatherworker goes from here to 300. Pick what you can get: Patterns from a vendor or a drop (Classic sources), or your specialization's own recipes. Craft each while it's orange or yellow.",
    options: [
      { spell: 19049, detail: "Pattern: Wicked Leather Gauntlets — Leonard Porter, Alterac Mountains (Alliance) or Werg Thickblade, Western Plaguelands (Horde) (Classic). Yellow to about 265." },
      { spell: 19048, detail: "Pattern: Heavy Scorpid Bracers — Zannok Hidepiercer, Silithus (Classic). Needs Heavy Scorpid Scale." },
      { spell: 19071, detail: "Pattern: Wicked Leather Headband — a drop (Classic). Good from 275 to about 295." },
      { spell: 19082, detail: "Pattern: Runic Leather Headband — Jase Farlane, Eastern Plaguelands (Classic). Good for the last points, 285–300." },
      { spell: 10647, detail: "Trainer recipe for every leatherworker, but it takes 40 Jet Black Feathers — orange until 245, yellow to about 255." },
      { spell: 10650, detail: "Dragonscale trainer recipe. Takes 30 Worn Dragonscale — good to about 260." },
      { spell: 19050, detail: "Dragonscale: Pattern from Masat T'andr, The Harborage, Swamp of Sorrows (Classic)." },
      { spell: 10632, detail: "Elemental trainer recipe. Takes Heart of Fire and Core of Earth — good to about 255." },
      { spell: 19061, detail: "Elemental: Pattern from Jangdor Swiftstrider (Horde) or Pratt McGrubben (Alliance), Feralas (Classic)." },
      { spell: 19053, detail: "Tribal: Pattern from Blimo Gadgetspring, Azshara (Classic). Needs Chimera Leather." },
      { spell: 19066, detail: "Tribal: Pattern from Qia, Winterspring (Classic). Needs Frostsaber Leather." },
    ],
    confidence: "unconfirmed",
  },
];
