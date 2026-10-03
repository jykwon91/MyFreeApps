/**
 * The community's class colours, used ONLY as 3 px accents on the raid page — never as text colour, so contrast
 * holds in both themes. Keyed by the bot's class keys (`raid_catalog.CLASSES`), which are `data/classes.ts`'s ids.
 */
import type { WowClassId } from "@/games/wow-forever/data/classes";

export const CLASS_ACCENTS: Readonly<Partial<Record<string, string>>> = {
  druid: "#FF7C0A",
  hunter: "#AAD372",
  mage: "#3FC7EB",
  paladin: "#F48CBA",
  priest: "#FFFFFF",
  rogue: "#FFF468",
  shaman: "#0070DD",
  warlock: "#8788EE",
  warrior: "#C69B6D",
} satisfies Record<WowClassId, string>;

/** A class's accent; none for no class (Tanks, the lists, "No class yet"). */
export function classAccent(classKey: string | null): string | undefined {
  if (classKey === null) return undefined;
  return CLASS_ACCENTS[classKey];
}
