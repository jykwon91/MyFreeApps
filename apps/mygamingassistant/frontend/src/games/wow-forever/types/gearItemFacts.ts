/** What the Forever client says it takes to use an item (beyond level and class). */
export interface GearItemFacts {
  /** A profession at a skill, e.g. Engineering 245 (goggles). */
  requires: { skill: string; rank: number } | null;
  /** A reputation rank, e.g. Honored with Argent Dawn. */
  reputation: { faction: string; rank: string } | null;
  /** PvP gear: a PvP rank, a battleground reputation, or Forever's "Premier" sets. */
  pvp: boolean;
  bindOnPickup: boolean;
}
