import { formatCost } from "@/games/wow-forever/crafting/matPrices";

/** A crate's cost after its refund; below zero the hand-in pays more than it cost, so it reads as a profit. */
export function formatCrateCost(copper: number): string {
  return copper < 0 ? `${formatCost(-copper)} profit` : formatCost(copper);
}
