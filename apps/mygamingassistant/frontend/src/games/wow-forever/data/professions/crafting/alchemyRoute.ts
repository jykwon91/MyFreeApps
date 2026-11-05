import type { CraftRouteEntry } from "@/games/wow-forever/types/crafting";

/**
 * Alchemy 1–300, trainer recipes and herbs only. Recipes, skill colours and
 * reagents are the Forever client's (`alchemy.json`); the skill each trainer
 * teaches a recipe at is Classic (cmangos), so every row is unconfirmed until
 * it's been tried in Forever. A test checks every row can be learned at its
 * start and is still not grey at its end.
 */
export const ALCHEMY_ROUTE: readonly CraftRouteEntry[] = [
  {
    kind: "craft",
    spell: 7183,
    from: 1,
    to: 60,
    note: "In Forever it takes 1 Silverleaf and 1 Peacebloom (Classic: 2 Silverleaf).",
    confidence: "unconfirmed",
  },
  { kind: "craft", spell: 2334, from: 60, to: 100, confidence: "unconfirmed" },
  { kind: "craft", spell: 3171, from: 100, to: 140, confidence: "unconfirmed" },
  { kind: "craft", spell: 3173, from: 140, to: 165, confidence: "unconfirmed" },
  { kind: "craft", spell: 3448, from: 165, to: 185, note: "From here on the recipes take Leaded Vials instead of Empty Vials.", confidence: "unconfirmed" },
  { kind: "craft", spell: 11449, from: 185, to: 210, confidence: "unconfirmed" },
  { kind: "craft", spell: 11448, from: 210, to: 235, confidence: "unconfirmed" },
  { kind: "craft", spell: 11461, from: 235, to: 260, note: "From here on the recipes take Crystal Vials.", confidence: "unconfirmed" },
  { kind: "craft", spell: 11467, from: 260, to: 280, confidence: "unconfirmed" },
  { kind: "craft", spell: 11478, from: 280, to: 300, confidence: "unconfirmed" },
];
