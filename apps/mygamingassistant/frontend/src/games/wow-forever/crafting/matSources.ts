/**
 * "Where do I get this?" for a crafting material: a short line for the
 * shopping list, and the sentences the open panel starts with. Sources are
 * Classic (cmangos classic-db) — the page labels them so.
 */
import {
  describeRareDrop,
  farmSpots,
  isCommonDrop,
  isRareDrop,
  levelRange,
  placeLabel,
  questsFor,
  splitVendors,
  stockSize,
  unknownSource,
} from "@/games/wow-forever/food/recipeSources";
import type { DisenchantFrom, DisenchantSource, DropSource, ItemSources, SkinningSource } from "@/games/wow-forever/types/recipeSources";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** Sold by this many of your vendors = "sold in most towns" rather than one vendor's name. */
export const SOLD_IN_MOST_TOWNS = 5;
/** A disenchant this likely is the way to get it; below, it's a lucky extra (shards from greens). */
export const LIKELY_DISENCHANT_PERCENT = 50;

/** Ways the shopping list's line under each material names. */
export const SUMMARY_PARTS = 2;

/** Where a material comes from, for one profession's guide. */
export interface MatInfo {
  sources: ItemSources;
  /** The profession that makes it, if any ("Blacksmithing" for rods). */
  madeBy: string | null;
}

/** " — most in The Barrens, Westfall", or nothing when no zone is known. */
function mostIn(zones: readonly string[]): string {
  if (!zones.length) return "";
  return ` — most in ${zones.join(", ")}`;
}

const DISENCHANT_NOUN: Readonly<Record<DisenchantFrom, string>> = {
  weapon: "green weapons, shields and off-hands",
  armor: "green armor",
};

function disenchantNoun(d: DisenchantSource): string {
  if (!d.mostlyFrom) return "green items";
  return DISENCHANT_NOUN[d.mostlyFrom];
}

/** "Disenchant green armor for level 21–30." / "Disenchant blue items for level 11–20 …". */
export function describeDisenchant(d: DisenchantSource): string {
  const band = levelRange([d.minLevel, d.maxLevel]);
  if (d.chance >= LIKELY_DISENCHANT_PERCENT) {
    return `Disenchant ${disenchantNoun(d)} for ${band} (about ${d.chance}% each).`;
  }
  if (d.fromBlue) return `Disenchant blue items for ${band} — every one gives a shard. Greens give one only about ${d.chance}% of the time.`;
  return `Sometimes (about ${d.chance}%) from disenchanting green items for ${band}.`;
}

/** "Skin beasts level 23–46 — most in Dustwallow Marsh, Desolace." */
export function describeSkinning(s: SkinningSource): string {
  return `Skin beasts ${levelRange(s.levels)}${mostIn(s.zones)}.`;
}

interface VendorPart {
  text: string;
  /** Every vendor you can use runs out — a fallback, not the plan. */
  limited: boolean;
}

function vendorPart(sources: ItemSources, faction: PlayerFaction, zoneId: number | null): VendorPart | null {
  const yours = splitVendors(sources.vendors, faction, zoneId).yours;
  if (!yours.length) return null;
  const limited = yours.every((v) => v.limited);
  const stock = limited ? ` (limited, ${stockSize(yours[0])})` : "";
  if (yours.length >= SOLD_IN_MOST_TOWNS) return { text: `Sold in most towns${stock}`, limited };
  return { text: `Sold by ${yours[0].name}, ${placeLabel(yours[0])}${stock}`, limited };
}

function dropPart(drop: DropSource, faction: PlayerFaction, zoneId: number | null): string {
  if (isRareDrop(drop)) return describeRareDrop(drop);
  if (isCommonDrop(drop)) {
    // Cloth: the nearest farm spot, by name — "drops from mobs" doesn't tell you where to go.
    const spot = farmSpots(drop, faction, zoneId)[0];
    if (!spot?.spot) return `Drops from mobs ${levelRange(drop.levels)}`;
    return `Drops from ${spot.name}, ${levelRange([spot.minLevel, spot.maxLevel])}, ${spot.spot.zoneName}`;
  }
  // The lowest-level mob that drops it — a leveling guide sends you where you can fight.
  const easiest = [...drop.mobs].sort((a, b) => a.minLevel - b.minLevel)[0];
  if (!easiest) return "Drops from mobs";
  return `Drops from ${easiest.name}, ${levelRange([easiest.minLevel, easiest.maxLevel])}`;
}

function disenchantPart(d: DisenchantSource): string {
  const band = levelRange([d.minLevel, d.maxLevel]);
  if (d.chance >= LIKELY_DISENCHANT_PERCENT) return `Disenchant ${band} ${disenchantNoun(d)}`;
  if (d.fromBlue) return `Disenchant ${band} blue items`;
  return `Rarely from disenchanting ${band} greens`;
}

/** Your vendors sell it — so it's bought, not made, even when a profession can make it (Copper Rod). */
export function soldToYou(sources: ItemSources, faction: PlayerFaction): boolean {
  return splitVendors(sources.vendors, faction, null).yours.length > 0;
}

/**
 * The one-line answer for the shopping list: the easiest two ways to get it,
 * e.g. "Sold in most towns" or "Disenchant level 21–30 green armor · Made by …".
 */
export function matSummary(info: MatInfo, faction: PlayerFaction, zoneId: number | null, maxParts = SUMMARY_PARTS): string {
  const { sources, madeBy } = info;
  const vendor = vendorPart(sources, faction, zoneId);
  const parts: string[] = [];
  if (vendor && !vendor.limited) parts.push(vendor.text);
  if (sources.disenchant) parts.push(disenchantPart(sources.disenchant));
  if (sources.skinning) parts.push(`Skin beasts ${levelRange(sources.skinning.levels)}`);
  if (sources.drop) parts.push(dropPart(sources.drop, faction, zoneId));
  if (madeBy) parts.push(`Made by ${madeBy}`);
  if (vendor?.limited) parts.push(vendor.text);
  // A chest that happens to hold cloth isn't worth naming next to the mobs that drop it.
  if (sources.containers.length && !sources.drop) parts.push(`Found in ${sources.containers[0]}`);
  if (questsFor(sources.quests, faction).length) parts.push("Quest reward");
  if (sources.fishing.length) parts.push("Fishing");
  if (sources.vendors.length && !vendor) parts.push("Only the other faction's vendors sell it");
  if (!parts.length) return "Source not known";
  return parts.slice(0, maxParts).join(" · ");
}

/** What the open panel says when nothing at all is known. */
export function unknownMat(itemId: number): string {
  return unknownSource(itemId, "it");
}
