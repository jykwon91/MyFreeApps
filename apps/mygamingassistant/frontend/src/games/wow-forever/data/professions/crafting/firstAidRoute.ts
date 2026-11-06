import type { CraftRouteEntry } from "@/games/wow-forever/types/crafting";

/**
 * First Aid 1–300, bandages only. Recipes, skill colours and reagents are the
 * Forever client's (`firstaid.json`, launch build 1.60.1.70790) — every
 * bandage is unchanged from Classic. Who teaches each one, and at what skill,
 * is Classic (cmangos), so the trainer rows are unconfirmed. Forever's new
 * potions, poultices and tourniquets aren't on the route: where their recipes
 * come from isn't known yet. A test checks every row can be learned at its
 * start and is still not grey at its end.
 */
export const FIRST_AID_ROUTE: readonly CraftRouteEntry[] = [
  { kind: "craft", spell: 3275, from: 1, to: 40, note: "Linen Cloth drops from humanoids around level 5–15.", confidence: "confirmed" },
  { kind: "craft", spell: 3276, from: 40, to: 50, confidence: "unconfirmed" },
  { kind: "craft", spell: 3276, from: 50, to: 80, confidence: "unconfirmed" },
  { kind: "craft", spell: 3277, from: 80, to: 115, note: "Wool Cloth drops from humanoids around level 15–25.", confidence: "unconfirmed" },
  { kind: "craft", spell: 3278, from: 115, to: 125, confidence: "unconfirmed" },
  { kind: "craft", spell: 3278, from: 125, to: 150, confidence: "unconfirmed" },
  {
    kind: "craft",
    spell: 7928,
    from: 150,
    to: 180,
    note: "Silk Cloth drops from humanoids around level 25–40. Reported in the beta: Silk Bandage is the last bandage trainers teach.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    spell: 7929,
    from: 180,
    to: 210,
    note: "Buy the manual where you bought Expert First Aid – Under Wraps; it sells the Mageweave manual too (Classic).",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    spell: 10840,
    from: 210,
    to: 225,
    note: "Mageweave drops from humanoids around level 35–50.",
    confidence: "unconfirmed",
  },
  { kind: "craft", spell: 10840, from: 225, to: 240, confidence: "unconfirmed" },
  {
    kind: "craft",
    spell: 10841,
    from: 240,
    to: 260,
    note: "Only the Triage doctor teaches this and the two Runecloth bandages (Classic) — learn them while you're there for the quest.",
    confidence: "unconfirmed",
  },
  { kind: "craft", spell: 18629, from: 260, to: 290, note: "Runecloth drops from humanoids around level 48–60.", confidence: "unconfirmed" },
  { kind: "craft", spell: 18630, from: 290, to: 300, confidence: "unconfirmed" },
];
