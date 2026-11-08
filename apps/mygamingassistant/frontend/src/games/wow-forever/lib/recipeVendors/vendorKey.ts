import type { VendorSpot } from "@/games/wow-forever/types/recipeSources";

/** One vendor at one spot (the same NPC can stand in two places). */
export function vendorKey(v: Pick<VendorSpot, "npcId" | "zoneId" | "x" | "y">): string {
  return `${v.npcId}@${v.zoneId}:${v.x},${v.y}`;
}
